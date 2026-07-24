import { PelagicExportType } from '@prisma/client';
import { env } from '../config/env';
import { minioStorageService, MinioStorageService } from './minioStorageService';
import { pelagicDataService } from './pelagicDataService';
import { validateCsvResponse } from '../utils/csvValidation';
import { buildCsvObjectKey, buildErrorObjectKey, buildManifestObjectKey } from '../utils/objectKeys';
import { assertValidDateRange, splitDateRange } from '../utils/dates';
import {
  acquireJobLock,
  buildJobLockKey,
  releaseJobLock,
} from '../utils/jobLock';
import {
  createJob,
  findSuccessfulDuplicate,
  markJobFailed,
  markJobRunning,
  markJobSuccess,
} from '../repositories/pelagicImportJobRepository';
import { PelagicExportOptions, PelagicSyncRequest } from '../types/pelagic';

export interface RunExportInput extends PelagicExportOptions {
  exportType: PelagicExportType;
  createdBy?: string;
  force?: boolean;
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
    };

    if (!input.force) {
      const duplicate = await findSuccessfulDuplicate(jobInput);
      if (duplicate) {
        return { skipped: true, job: duplicate, message: 'Import déjà réussi pour cette période et ces filtres' };
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

    try {
      await markJobRunning(job.id);

      const fetchResult =
        input.exportType === 'trips'
          ? await pelagicDataService.exportTrips(input)
          : await pelagicDataService.exportPoints(input);

      const validation = validateCsvResponse(fetchResult.buffer, fetchResult.contentType);
      if (!validation.valid) {
        throw new Error(validation.message || 'CSV invalide');
      }

      const downloadedAt = new Date();
      const objectKey = buildCsvObjectKey(input.exportType, input.dateFrom, input.dateTo, downloadedAt);
      const checksum = MinioStorageService.sha256(fetchResult.buffer);
      const fileName = objectKey.split('/').pop() || objectKey;

      await minioStorageService.uploadObject({
        key: objectKey,
        body: fetchResult.buffer,
        size: fetchResult.buffer.length,
        contentType: 'text/csv',
        metadata: {
          'export-type': input.exportType,
          'date-from': input.dateFrom,
          'date-to': input.dateTo,
          'imported-at': downloadedAt.toISOString(),
          'imeis': (input.imeis || []).join(','),
          'tags': (input.tags || []).join(','),
          'checksum-sha256': checksum,
          'job-uuid': job.jobUuid,
          'status': 'SUCCESS',
        },
      });

      const manifestKey = buildManifestObjectKey(input.dateFrom, downloadedAt);
      const manifest = {
        jobId: job.jobUuid,
        exportType: input.exportType,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        imeis: input.imeis || [],
        tags: input.tags || [],
        deviceInfo: input.deviceInfo ?? true,
        withLastSeen: input.withLastSeen ?? true,
        errant: input.errant ?? false,
        downloadedAt: downloadedAt.toISOString(),
        bucket: env.minio.bucket,
        objectKey,
        fileSize: fetchResult.buffer.length,
        checksumSha256: checksum,
        status: 'SUCCESS',
        rowCount: validation.rowCount,
        note: validation.emptyData ? validation.message : undefined,
      };

      await minioStorageService.uploadObject({
        key: manifestKey,
        body: Buffer.from(JSON.stringify(manifest, null, 2)),
        contentType: 'application/json',
        metadata: { 'job-uuid': job.jobUuid },
      });

      const updated = await markJobSuccess(job.id, {
        minioBucket: env.minio.bucket,
        minioObjectKey: objectKey,
        fileName,
        fileSize: BigInt(fetchResult.buffer.length),
        checksumSha256: checksum,
        httpStatus: fetchResult.httpStatus,
        rowCount: validation.rowCount,
        errorMessage: validation.emptyData ? validation.message : undefined,
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

      await markJobFailed(job.id, message, httpStatus);
      throw error;
    } finally {
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

export const pelagicImportOrchestrator = new PelagicImportOrchestrator();


export function assertSyncProducedResults(run: SyncRunResult): void {
  if (run.results.length > 0) return;
  const detail = run.failures
    .map((failure) => `${failure.exportType} ${failure.dateFrom}: ${failure.error}`)
    .join('; ');
  throw new Error(detail || 'Synchronisation échouée');
}
