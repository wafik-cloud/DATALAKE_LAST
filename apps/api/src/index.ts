import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { minioStorageService } from './services/minioStorageService';
import { connectDatabase } from './lib/prisma';
import { startPelagicScheduler } from './jobs/pelagicSyncScheduler';
import storageRoutes from './routes/admin/storageRoutes';
import pelagicRoutes from './routes/admin/pelagicRoutes';
import dashboardRoutes from './routes/admin/dashboardRoutes';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'datalake-last-api', version: '0.3.0' });
});

app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/admin/storage', storageRoutes);
app.use('/api/admin/pelagic', pelagicRoutes);

async function bootstrap() {
  let dbReady = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await connectDatabase();
      await startPelagicScheduler();
      dbReady = true;
      break;
    } catch (error) {
      console.warn(
        `[db] Connexion impossible (tentative ${attempt}/10):`,
        error instanceof Error ? error.message : error
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  if (!dbReady) {
    console.error('[db] Impossible de démarrer le scheduler Pelagic — base indisponible');
  }

  try {
    await minioStorageService.initializeBucket();
    console.log(`[minio] Bucket prêt: ${env.minio.bucket}`);
  } catch (error) {
    console.warn(
      '[minio] Initialisation au démarrage échouée:',
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
