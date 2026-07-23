import { Router } from 'express';
import { env } from '../../config/env';
import { minioStorageService } from '../../services/minioStorageService';
import { requireAdmin } from '../../middleware/requireAdmin';

const router = Router();

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

export default router;
