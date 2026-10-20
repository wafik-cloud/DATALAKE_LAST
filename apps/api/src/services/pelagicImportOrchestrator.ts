import { PelagicExportType } from '@prisma/client';
import { env } from '../config/env';
import { minioStorageService } from './minioStorageService';
import { pelagicDataService } from './pelagicDataService';
import { buildCsvObjectKey, buildErrorObjectKey, buildManifestObjectKey } from '../utils/objectKeys';
import { createAndStoreMapPreview } from './mapPreviewService';
import { assertValidDateRange, splitDateRange, toPelagicExclusiveDateTimeRange } from '../utils/dates';
import {
  acquireJobLock,
  buildJobLockKey,
  releaseJobLock,
} from '../utils/jobLock';
import {
  createJob,
  findSuccessfulDuplicates,
  markJobFailed,
  markJobRunning,
  markJobSuccess,
} from '../repositories/pelagicImportJobRepository';
import { PelagicExportOptions, PelagicSyncRequest } from '../types/pelagic';
import { headerHasBoatRegistration } from './pelagicTripRegistration';

export interface RunExportInput extends PelagicExportOptions {
  exportType: PelagicExportType;
  createdBy?: string;
  force?: boolean;
  scheduleRunId?: string;
}


export interface SyncFailure {
  exportType: PelagicExportType;
  dateFrom: string;
  dateTo: string;
  error: string;
}

export interface SyncRunResult {
  results: Awaited<ReturnType<PelagicImportOrchestrator['runExport']>>[];
  failures: SyncFailure[];
}

export class PelagicImportOrchestrator {
  async runExport(input: RunExportInput) {
    const requestedDateFrom = input.dateFrom;
    const requestedDateTo = input.dateTo;

    // Enregistrer les filtres réellement envoyés à Pelagic, y compris dans le manifeste.
    if (input.exportType === 'trips' && input.joinBoatRegistration !== false) {
      input = { ...input, deviceInfo: true };
    }

    if (input.exportType === 'points') {
      input = { ...input, ...toPelagicExclusiveDateTimeRange(input.dateFrom, input.dateTo) };
    }

    assertValidDateRange(input.dateFrom, input.dateTo);

    const jobInput = {
      exportType: input.exportType,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      imeis: input.imeis || [],
      tags: input.tags || [],
      deviceInfo: input.deviceInfo,
      withLastSeen: input.withLastSeen,
      includeErrant: input.errant,
      createdBy: input.createdBy,
      scheduleRunId: input.scheduleRunId,
    };

    if (!input.force) {
      const duplicates = await findSuccessfulDuplicates(jobInput);
      for (const duplicate of duplicates) {
        const objectExists = duplicate.minioObjectKey
          ? await minioStorageService.objectExists(duplicate.minioObjectKey)
          : false;
        if (objectExists && duplicate.minioObjectKey) {
          // A trips file imported before the boat join has no registration columns.
          // Skipping it would keep serving that old CSV. Reimport this period only.
          if (input.exportType === 'trips' && input.joinBoatRegistration !== false) {
            const header = await readObjectHeaderLine(duplicate.minioObjectKey);
            if (!headerHasBoatRegistration(header)) {
              console.log(`[pelagic] trips sans immatriculation, réimport ${input.dateFrom} → ${input.dateTo}`);
              break;
            }
          }
          return { skipped: true, job: duplicate, message: 'Import déjà réussi pour cette période et ces filtres' };
        }
        await markJobFailed(
          duplicate.id,
          'Fichier MinIO introuvable, réimport requis'
        );
      }
    }

    const lockKey = buildJobLockKey({
      exportType: input.exportType,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      imeis: jobInput.imeis,
      tags: jobInput.tags,
    });

    if (!acquireJobLock(lockKey)) {
      throw new Error('Un traitement identique est déjà en cours');
    }

    const job = await createJob(jobInput);

    let cleanupDownload: (() => Promise<void>) | undefined;
    const storedObjectKeys: string[] = [];
    try {
      await markJobRunning(job.id);

      const fetchResult =
        input.exportType === 'trips'
          // exportTrips ajoute boats/info et les colonnes d'immatriculation (jointure Device Id).
          ? await pelagicDataService.exportTrips(input)
          : await pelagicDataService.exportPoints(input);
      cleanupDownload = fetchResult.cleanup;

      const downloadedAt = new Date();
      const objectKey = buildCsvObjectKey(
        input.exportType,
        requestedDateFrom,
        requestedDateTo,
        downloadedAt
      );
      const checksum = fetchResult.checksumSha256;
      const fileName = objectKey.split('/').pop() || objectKey;

      await minioStorageService.uploadObject({
        key: objectKey,
        body: fetchResult.createReadStream(),
        size: fetchResult.fileSize,
        contentType: 'text/csv',
        metadata: {
          'export-type': input.exportType,
          'date-from': input.dateFrom,
          'date-to': input.dateTo,
          'requested-date-from': requestedDateFrom,
          'requested-date-to': requestedDateTo,
          'imported-at': downloadedAt.toISOString(),
          'imeis': (input.imeis || []).join(','),
          'tags': (input.tags || []).join(','),
          'checksum-sha256': checksum,
          'job-uuid': job.jobUuid,
          'status': 'SUCCESS',
        },
      });
      storedObjectKeys.push(objectKey);

      const mapPreview =
        input.exportType === 'points'
          ? await createAndStoreMapPreview(objectKey, fetchResult.createReadStream())
          : null;
      if (mapPreview) storedObjectKeys.push(mapPreview.previewObjectKey);

      const manifestKey = buildManifestObjectKey(input.dateFrom, downloadedAt);
      const manifest = {
        jobId: job.jobUuid,
        exportType: input.exportType,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        requestedDateFrom,
        requestedDateTo,
        imeis: input.imeis || [],
        tags: input.tags || [],
        deviceInfo: input.deviceInfo ?? true,
        withLastSeen: input.withLastSeen ?? true,
        errant: input.errant ?? false,
        downloadedAt: downloadedAt.toISOString(),
        bucket: env.minio.bucket,
        objectKey,
        fileSize: fetchResult.fileSize,
        checksumSha256: checksum,
        status: 'SUCCESS',
        rowCount: fetchResult.rowCount,
        unmatchedBoatCount: fetchResult.unmatchedBoatCount,
        mapPreviewKey: mapPreview?.previewObjectKey,
        note: fetchResult.emptyData ? 'Aucune donnée disponible pour la période sélectionnée.' : undefined,
      };

      await minioStorageService.uploadObject({
        key: manifestKey,
        body: Buffer.from(JSON.stringify(manifest, null, 2)),
        contentType: 'application/json',
        metadata: { 'job-uuid': job.jobUuid },
      });
      storedObjectKeys.push(manifestKey);

      const updated = await markJobSuccess(job.id, {
        minioBucket: env.minio.bucket,
        minioObjectKey: objectKey,
        fileName,
        fileSize: BigInt(fetchResult.fileSize),
        checksumSha256: checksum,
        httpStatus: fetchResult.httpStatus,
        rowCount: fetchResult.rowCount,
        errorMessage: fetchResult.emptyData ? 'Aucune donnée disponible pour la période sélectionnée.' : undefined,
      });

      return { skipped: false, job: updated, manifestKey };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur import Pelagic';
      const httpStatus = (error as Error & { status?: number }).status;

      await minioStorageService.uploadObject({
        key: buildErrorObjectKey(new Date()),
        body: Buffer.from(JSON.stringify({ jobId: job.jobUuid, message, httpStatus }, null, 2)),
        contentType: 'application/json',
      }).catch(() => undefined);

      await Promise.all(
        storedObjectKeys.map((key) => minioStorageService.deleteObject(key).catch(() => undefined))
      );

      await markJobFailed(job.id, message, httpStatus);
      throw error;
    } finally {
      await cleanupDownload?.().catch(() => undefined);
      releaseJobLock(lockKey);
    }
  }

  async runSync(request: PelagicSyncRequest, createdBy?: string): Promise<SyncRunResult> {
    assertValidDateRange(request.dateFrom, request.dateTo);
    const exportTypes: PelagicExportType[] = request.exportTypes?.length
      ? request.exportTypes
      : ['trips', 'points'];

    const intervalDays = request.intervalDays || 1;
    const ranges = splitDateRange(request.dateFrom, request.dateTo, intervalDays);
    const results: SyncRunResult['results'] = [];
    const failures: SyncFailure[] = [];

    for (const range of ranges) {
      for (const exportType of exportTypes) {
        try {
          const result = await this.runExport({
            exportType,
            dateFrom: range.from,
            dateTo: range.to,
            imeis: request.imeis,
            tags: request.tags,
            deviceInfo: request.deviceInfo,
            withLastSeen: request.withLastSeen,
            errant: request.includeErrant,
            force: request.force,
            createdBy,
            scheduleRunId: request.scheduleRunId,
          });
          results.push(result);
        } catch (error) {
          failures.push({
            exportType,
            dateFrom: range.from,
            dateTo: range.to,
            error: error instanceof Error ? error.message : 'Erreur import Pelagic',
          });
        }
      }
    }

    return { results, failures };
  }
}

async function readObjectHeaderLine(key: string): Promise<string> {
  const stream = await minioStorageService.downloadObject(key);
  let text = '';
  try {
    for await (const chunk of stream) {
      text += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      const newline = text.search(/\r?\n/);
      if (newline >= 0) {
        text = text.slice(0, newline);
        break;
      }
      if (text.length > 8192) break;
    }
  } finally {
    stream.destroy();
  }
  return text.replace(/^\uFEFF/, '').trim();
}

export const pelagicImportOrchestrator = new PelagicImportOrchestrator();


export function assertSyncProducedResults(run: SyncRunResult): void {
  if (run.results.length > 0) return;
  const detail = run.failures
    .map((failure) => `${failure.exportType} ${failure.dateFrom}: ${failure.error}`)
    .join('; ');
  throw new Error(detail || 'Synchronisation échouée');
}
