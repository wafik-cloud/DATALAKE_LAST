import { Router } from 'express';
import { env } from '../../config/env';
import { minioStorageService } from '../../services/minioStorageService';
import { requireAdmin } from '../../middleware/requireAdmin';
import { isAllowedObjectKey } from '../../utils/objectKeys';
import { getJobById } from '../../repositories/pelagicImportJobRepository';
import { writeAuditLog } from '../../repositories/auditLogRepository';

const router = Router();

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

router.use(requireAdmin);

router.get('/status', async (_req, res) => {
  try {
    const connection = await minioStorageService.testConnection();
    const objects = await minioStorageService.listObjects();
    const totalSize = objects.reduce((sum, item) => sum + (item.size || 0), 0);

    res.json({
      minio: {
        connected: connection.ok,
        bucket: connection.bucket,
        endpoint: env.minio.publicEndpoint,
        consoleUrl: env.minio.consoleUrl,
        region: env.minio.region,
        ssl: env.minio.useSSL,
        objectCount: objects.length,
        totalSizeBytes: totalSize,
      },
    });
  } catch (error) {
    res.status(503).json({
      minio: {
        connected: false,
        bucket: env.minio.bucket,
        endpoint: env.minio.publicEndpoint,
        error: error instanceof Error ? error.message : 'Erreur MinIO',
      },
    });
  }
});

router.post('/test', async (_req, res) => {
  try {
    const result = await minioStorageService.testConnection();
    res.json(result);
  } catch (error) {
    res.status(503).json({
      ok: false,
      bucket: env.minio.bucket,
      message: error instanceof Error ? error.message : 'Test MinIO échoué',
    });
  }
});

router.get('/objects', async (req, res) => {
  try {
    const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : '';
    const objects = await minioStorageService.listObjects(prefix);
    res.json({
      items: objects.map((item) => ({
        key: item.name,
        size: item.size,
        lastModified: item.lastModified,
        etag: item.etag,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Impossible de lister les objets',
    });
  }
});

router.get('/objects/download', async (req, res) => {
  try {
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    if (!key || !isAllowedObjectKey(key)) {
      return res.status(400).json({ error: 'Clé objet invalide' });
    }
    const url = await minioStorageService.generatePresignedDownloadUrl(key, 900);
    res.json({ key, url, expiresInSeconds: 900 });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'URL temporaire impossible' });
  }
});

router.delete('/objects', async (req, res) => {
  try {
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    if (!key || !isAllowedObjectKey(key)) {
      return res.status(400).json({ error: 'Clé objet invalide' });
    }
    await minioStorageService.deleteObject(key);
    await writeAuditLog('STORAGE_DELETE', req.header('X-User') || 'admin', key);
    res.json({ message: 'Objet supprimé', key });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Suppression impossible' });
  }
});

router.get('/objects/:id', async (req, res) => {
  try {
    const job = await getJobById(paramId(req.params.id));
    if (!job?.minioObjectKey) {
      return res.status(404).json({ error: 'Objet associé introuvable' });
    }
    const metadata = await minioStorageService.getObjectMetadata(job.minioObjectKey);
    res.json({ job, metadata });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Détail objet impossible' });
  }
});

export default router;
