import type { PelagicImportJob } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { minioStorageService } from './minioStorageService';

type Json = Record<string, unknown>;
type ObjectEntry = { name?: string; size?: number; lastModified?: Date; etag?: string };
type Job = Pick<PelagicImportJob, 'id' | 'jobUuid' | 'exportType' | 'dateFrom' | 'dateTo' | 'rowCount' | 'status' | 'minioObjectKey' | 'completedAt' | 'failedAt' | 'errorMessage' | 'imeis' | 'tags' | 'deviceInfo' | 'withLastSeen' | 'includeErrant'>;
const text = (value: unknown): string | null => typeof value === 'string' ? value : null;
const count = (value: unknown): number | null => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
const dataFile = (key: string) => /^(trips|points)\/.+\.csv$/i.test(key);

async function readJson(key: string): Promise<Json> {
  const stream = await minioStorageService.downloadObject(key);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('Métadonnées trop volumineuses');
    chunks.push(Buffer.from(chunk));
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Métadonnées invalides');
  return value as Json;
}

/** Read small manifests/errors only; never scan the CSV contents for counts. */
export async function buildExplorerItems(objects: ObjectEntry[], jobs: Job[], loadJson: (key: string) => Promise<Json>) {
  const metadata = objects.filter(o => /^(manifests|errors)\/.+\.json$/i.test(o.name || ''));
  const documents = new Map<string, Json>();
  let unreadableMetadata = 0;
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, metadata.length) }, async () => {
    while (next < metadata.length) {
      const object = metadata[next++];
      try {
        if ((object.size || 0) > 64 * 1024) throw new Error('Métadonnées trop volumineuses');
        documents.set(object.name!, await loadJson(object.name!));
      } catch { unreadableMetadata++; }
    }
  }));

  const manifests = new Map<string, { key: string; value: Json }>();
  const counters = new Map<string, Json>();
  const errorDocuments = new Map<string, string>();
  for (const [key, value] of documents) {
    const objectKey = text(value.objectKey);
    if (value.type === 'csv-row-count' && objectKey) {
      if (String(value.verifiedAt || '') > String(counters.get(objectKey)?.verifiedAt || '')) counters.set(objectKey, value);
      continue;
    }
    if (key.startsWith('manifests/') && objectKey && dataFile(objectKey) && objectKey.startsWith(`${value.exportType}/`)) {
      const previous = manifests.get(objectKey);
      if (!previous || String(value.downloadedAt || '') > String(previous.value.downloadedAt || '')) manifests.set(objectKey, { key, value });
    }
    if (key.startsWith('errors/') && text(value.jobId) && text(value.message)) errorDocuments.set(String(value.jobId), String(value.message).slice(0, 1000));
  }
  const jobsByObject = new Map<string, Job>();
  for (const job of jobs) if (job.minioObjectKey && !jobsByObject.has(job.minioObjectKey)) jobsByObject.set(job.minioObjectKey, job);
  const arrayKey = (value: unknown) => JSON.stringify(Array.isArray(value) ? [...value].sort() : []);
  const periodKey = (j: { exportType: unknown; dateFrom: unknown; dateTo: unknown; imeis?: unknown; tags?: unknown; deviceInfo?: unknown; withLastSeen?: unknown; includeErrant?: unknown }) =>
    JSON.stringify([j.exportType, j.dateFrom, j.dateTo, arrayKey(j.imeis), arrayKey(j.tags), j.deviceInfo ?? true, j.withLastSeen ?? true, j.includeErrant ?? false]);
  const failures = new Map<string, Job[]>();
  for (const job of jobs.filter(j => j.status === 'FAILED')) {
    const key = periodKey(job);
    failures.set(key, [...(failures.get(key) || []), job]);
  }

  const items = objects.filter(o => dataFile(o.name || '')).map(object => {
    const key = object.name!;
    const manifest = manifests.get(key);
    const m = manifest?.value;
    const candidate = counters.get(key);
    const verified = typeof candidate?.etag === 'string' && candidate.etag === object.etag &&
      typeof candidate.fileSize === 'number' && candidate.fileSize === object.size && count(candidate.rowCount) != null ? candidate : undefined;
    const job = jobsByObject.get(key);
    const exportType = key.split('/')[0] as 'trips' | 'points';
    const period = job || { exportType, dateFrom: m?.dateFrom, dateTo: m?.dateTo, imeis: m?.imeis, tags: m?.tags,
      deviceInfo: m?.deviceInfo, withLastSeen: m?.withLastSeen, includeErrant: m?.errant };
    const errors = (failures.get(periodKey(period)) || []).map(failed => ({
      id: failed.jobUuid, message: errorDocuments.get(failed.jobUuid) || failed.errorMessage || 'Import en échec',
      at: failed.failedAt?.toISOString() || null,
    }));
    return {
      key, size: object.size, lastModified: object.lastModified, etag: object.etag, exportType,
      rowCount: count(verified?.rowCount) ?? count(m?.rowCount) ?? count(job?.rowCount),
      rowCountVerifiedAt: text(verified?.verifiedAt),
      checksumSha256: text(m?.checksumSha256),
      dateFrom: text(m?.dateFrom) || job?.dateFrom || null,
      dateTo: text(m?.dateTo) || job?.dateTo || null,
      importedAt: text(m?.downloadedAt) || job?.completedAt?.toISOString() || null,
      status: job?.status || text(m?.status) || 'UNKNOWN',
      metadataSource: manifest ? 'manifest' : job ? 'history' : 'none',
      manifestKey: manifest?.key || null,
      unmatchedBoatCount: count(m?.unmatchedBoatCount), errors,
    };
  });
  return { items, unreadableMetadata };
}

export async function getStorageExplorer() {
  const [objects, jobs] = await Promise.all([
    minioStorageService.listObjects(),
    prisma.pelagicImportJob.findMany({ orderBy: { createdAt: 'desc' }, select: {
      id: true, jobUuid: true, exportType: true, dateFrom: true, dateTo: true, rowCount: true, status: true,
      minioObjectKey: true, completedAt: true, failedAt: true, errorMessage: true, imeis: true, tags: true,
      deviceInfo: true, withLastSeen: true, includeErrant: true,
    } }),
  ]);
  return buildExplorerItems(objects, jobs, readJson);
}
