import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { minioStorageService } from './services/minioStorageService';
import storageRoutes from './routes/admin/storageRoutes';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'datalake-last-api' });
});

app.use('/api/admin/storage', storageRoutes);

async function bootstrap() {
  try {
    await minioStorageService.initializeBucket();
    console.log(`[minio] Bucket prêt: ${env.minio.bucket}`);
  } catch (error) {
    console.warn(
      '[minio] Initialisation au démarrage échouée (MinIO peut ne pas être encore prêt):',
      error instanceof Error ? error.message : error
    );
  }

  app.listen(env.port, () => {
    console.log(`[api] DATALAKE_LAST API écoute sur le port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error('[api] Démarrage impossible:', error);
  process.exit(1);
});
