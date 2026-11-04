import { describe, expect, it, vi } from 'vitest';
vi.mock('../lib/prisma', () => ({ prisma: {} }));
vi.mock('./minioStorageService', () => ({ minioStorageService: {} }));
import { buildExplorerItems } from './storageExplorerService';

type Job = Parameters<typeof buildExplorerItems>[1][number];
const csv = 'points/2026/11/points.csv';
const job: Job = { id: 'db-id', jobUuid: 'success-uuid', exportType: 'points', dateFrom: '2026-11-02 01:00:00',
  dateTo: '2026-11-03 01:00:00', rowCount: 214899, status: 'SUCCESS', minioObjectKey: csv,
  completedAt: new Date('2026-11-04T13:36:18Z'), failedAt: null, errorMessage: null,
  imeis: [], tags: [], deviceInfo: true, withLastSeen: true, includeErrant: false };

describe('explorer provenance', () => {
  it('joins by the manifest object key, attaches earlier errors and hides supporting objects', async () => {
    const failed: Job = { ...job, id: 'failed-id', jobUuid: 'failed-uuid', status: 'FAILED', minioObjectKey: null,
      rowCount: null, failedAt: new Date('2026-11-03T01:00:00Z'), errorMessage: 'Interrupted' };
    const docs: Record<string, Record<string, unknown>> = {
      'manifests/2026/11/new.json': { objectKey: csv, exportType: 'points', rowCount: 214899,
        dateFrom: job.dateFrom, dateTo: job.dateTo, status: 'SUCCESS', downloadedAt: '2026-11-04T13:36:18Z' },
      'errors/2026/11/error.json': { jobId: 'failed-uuid', message: 'Disk write failed' },
    };
    const result = await buildExplorerItems([{ name: csv }, ...Object.keys(docs).map(name => ({ name })),
      { name: 'previews/maps/a.json' }], [job, failed], async key => docs[key]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ rowCount: 214899, status: 'SUCCESS', metadataSource: 'manifest' });
    expect(result.items[0].errors).toEqual([{ id: 'failed-uuid', message: 'Disk write failed', at: '2026-11-03T01:00:00.000Z' }]);
  });

  it('falls back to import history when a manifest is corrupt, preserving zero counts', async () => {
    const result = await buildExplorerItems([{ name: csv }, { name: 'manifests/broken.json' }],
      [{ ...job, rowCount: 0 }], async () => { throw new Error('Invalid JSON'); });
    expect(result.unreadableMetadata).toBe(1);
    expect(result.items[0]).toMatchObject({ rowCount: 0, metadataSource: 'history' });
  });

  it('does not guess missing counts or attribute failures with other filters', async () => {
    const failed: Job = { ...job, status: 'FAILED', minioObjectKey: null, imeis: ['another-device'] };
    const result = await buildExplorerItems([{ name: csv }], [failed], async () => ({}));
    expect(result.items[0]).toMatchObject({ rowCount: null, status: 'UNKNOWN', errors: [] });
  });

  it('uses verified CSV counts only when the file size and ETag still match', async () => {
    const docs = { type: 'csv-row-count', objectKey: csv, rowCount: 26517, etag: 'current', fileSize: 6324580,
      verifiedAt: '2026-11-04T14:00:00Z' };
    const objects = [{ name: csv, etag: 'current', size: 6324580 }, { name: 'manifests/counts/a.json' }];
    const result = await buildExplorerItems(objects, [{ ...job, rowCount: 17 }], async () => docs);
    expect(result.items[0]).toMatchObject({ rowCount: 26517, rowCountVerifiedAt: docs.verifiedAt });
    const replaced = await buildExplorerItems([{ ...objects[0], etag: 'replaced' }, objects[1]], [job], async () => docs);
    expect(replaced.items[0].rowCount).toBe(job.rowCount);
    expect(replaced.items[0].rowCountVerifiedAt).toBeNull();
  });
});
