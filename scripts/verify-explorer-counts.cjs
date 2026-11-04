// Run from the repository root against the deployed API:
// docker exec -i datalake-api node < scripts/verify-explorer-counts.cjs
// Existing counters matching file size and ETag are reused; CSVs are never modified.
const crypto = require('node:crypto');
const { getStorageExplorer } = require('/app/dist/services/storageExplorerService');
const { countCsvRows } = require('/app/dist/utils/csvRowCounter');
const { minioStorageService: storage } = require('/app/dist/services/minioStorageService');
const { prisma } = require('/app/dist/lib/prisma');
const log = data => console.log(JSON.stringify({ at: new Date().toISOString(), ...data }));

(async () => {
  const { items } = await getStorageExplorer();
  let verified = 0, corrected = 0, failed = 0;
  for (const item of items) {
    if (item.rowCountVerifiedAt) { verified++; continue; }
    try {
      const result = await countCsvRows(await storage.downloadObject(item.key));
      if (result.bytes !== item.size) throw Error('File size mismatch');
      if (item.checksumSha256 && result.checksumSha256 !== item.checksumSha256) throw Error('SHA-256 differs from original manifest');
      const counter = { type: 'csv-row-count', objectKey: item.key, exportType: item.exportType,
        etag: item.etag, fileSize: result.bytes, rowCount: result.rowCount,
        checksumSha256: result.checksumSha256, verifiedAt: new Date().toISOString(), declaredRowCount: item.rowCount };
      const key = 'manifests/counts/' + crypto.createHash('sha256').update(item.key).digest('hex') + '.json';
      await storage.uploadObject({ key, body: Buffer.from(JSON.stringify(counter)), contentType: 'application/json' });
      verified++;
      if (result.rowCount !== item.rowCount) corrected++;
      log({ event: 'verified', key: item.key, rows: result.rowCount, previousRows: item.rowCount, verified, corrected, total: items.length });
    } catch (error) {
      failed++;
      log({ event: 'failed', key: item.key, error: error.message });
    }
  }
  log({ event: 'complete', verified, corrected, failed, total: items.length });
  if (failed) process.exitCode = 1;
})().catch(error => { log({ event: 'fatal', error: error.message }); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
