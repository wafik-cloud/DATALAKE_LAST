import express from 'express';
import cors from 'cors';
import { authRoutes } from './routes/authRoutes';
import accessRoutes from './routes/admin/accessRoutes';
import { authenticate, recordActivity } from './middleware/requireAdmin';
import { env } from './config/env';
import { minioStorageService } from './services/minioStorageService';
import { connectDatabase } from './lib/prisma';
import { failStaleRunningJobs } from './repositories/pelagicImportJobRepository';
import { startPelagicScheduler } from './jobs/pelagicSyncScheduler';
import storageRoutes from './routes/admin/storageRoutes';
import pelagicRoutes from './routes/admin/pelagicRoutes';
import dashboardRoutes from './routes/admin/dashboardRoutes';
import maintenanceRoutes from './routes/admin/maintenanceRoutes';
import { startMultiScheduleRegistry } from './services/multiScheduleService';

export const app = express();

const allowedOrigins = (process.env.APP_PUBLIC_URL || 'http://localhost:5173,http://localhost:5174,http://172.16.10.101:5174').split(',').map(s => s.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.header('Origin') && !allowedOrigins.includes(req.header('Origin')!)) {
    res.status(403).json({ error: 'Origine non autorisée' }); return;
  }
  next();
});
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'datalake-last-api', version: '0.3.0' });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', authenticate, recordActivity, (_req, res, next) => {
  if (res.locals.user.mustChangePassword) { res.status(403).json({ error: 'Veuillez changer votre mot de passe initial.', code: 'PASSWORD_CHANGE_REQUIRED' }); return; }
  next();
});
app.use('/api/admin/access', accessRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/admin/storage', storageRoutes);
app.use('/api/admin/pelagic', pelagicRoutes);
app.use('/api/admin/maintenance', maintenanceRoutes);

async function bootstrap() {
  let dbReady = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await connectDatabase();
      const stale = await failStaleRunningJobs();
      if (stale > 0) {
        console.warn(`[jobs] ${stale} import(s) RUNNING obsolète(s) marqué(s) en échec`);
      }
      await startPelagicScheduler();
      await startMultiScheduleRegistry();
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

  // Identity management stays available while the storage service is unavailable.
  app.listen(env.port, () => {
    console.log(`[api] DATALAKE_LAST API écoute sur le port ${env.port}`);
  });

  try {
    await minioStorageService.initializeBucket();
    console.log(`[minio] Bucket prêt: ${env.minio.bucket}`);
  } catch (error) {
    console.warn(
      '[minio] Initialisation au démarrage échouée:',
      error instanceof Error ? error.message : error
    );
  }

}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] Erreur interne', error instanceof Error ? error.name : 'unknown');
  res.status(500).json({ error: 'Une erreur interne est survenue.' });
});

if (require.main === module) bootstrap().catch((error) => {
  console.error('[api] Démarrage impossible:', error);
  process.exit(1);
});
