import { PelagicJobStatus, PelagicExportType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { minioStorageService } from './minioStorageService';
import { env, pelagicConfigured } from '../config/env';
import { getIntegrationSettings } from '../repositories/integrationSettingsRepository';
import { maskSecret } from '../utils/maskSecret';

export async function getDashboardStats() {
  const settings = await getIntegrationSettings();

  const [successCount, failedCount, runningCount, lastTrips, lastPoints, objects] = await Promise.all([
    prisma.pelagicImportJob.count({ where: { status: PelagicJobStatus.SUCCESS } }),
    prisma.pelagicImportJob.count({ where: { status: PelagicJobStatus.FAILED } }),
    prisma.pelagicImportJob.count({ where: { status: PelagicJobStatus.RUNNING } }),
    prisma.pelagicImportJob.findFirst({
      where: { exportType: PelagicExportType.trips, status: PelagicJobStatus.SUCCESS },
      orderBy: { completedAt: 'desc' },
    }),
    prisma.pelagicImportJob.findFirst({
      where: { exportType: PelagicExportType.points, status: PelagicJobStatus.SUCCESS },
      orderBy: { completedAt: 'desc' },
    }),
    minioStorageService.listObjects().catch(() => []),
  ]);

  let minioConnected = false;
  try {
    await minioStorageService.testConnection();
    minioConnected = true;
  } catch {
    minioConnected = false;
  }

  let pelagicConnected = pelagicConfigured();

  const totalSize = objects.reduce((sum, item) => sum + (item.size || 0), 0);
  const recentFailures = await prisma.pelagicImportJob.count({
    where: {
      status: PelagicJobStatus.FAILED,
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
  });

  const hoursSinceSync = settings.lastSyncAt
    ? (Date.now() - settings.lastSyncAt.getTime()) / (1000 * 60 * 60)
    : null;

  return {
    minio: {
      connected: minioConnected,
      bucket: env.minio.bucket,
      consoleUrl: env.minio.consoleUrl,
      objectCount: objects.length,
      totalSizeBytes: totalSize,
    },
    pelagic: {
      connected: pelagicConnected,
      configured: pelagicConfigured(),
      baseUrl: env.pelagic.baseUrl,
      token: maskSecret(env.pelagic.token),
    },
    sync: {
      enabled: settings.syncEnabled,
      cron: settings.syncCron,
      timezone: settings.syncTimezone,
      lastSyncAt: settings.lastSyncAt,
      lastSyncStatus: settings.lastSyncStatus,
      nextRunHint: `CRON ${settings.syncCron} (${settings.syncTimezone})`,
      staleSync: hoursSinceSync != null ? hoursSinceSync > 48 : true,
    },
    jobs: {
      success: successCount,
      failed: failedCount,
      running: runningCount,
      recentFailures48h: recentFailures,
      lastTripsExportAt: lastTrips?.completedAt,
      lastPointsExportAt: lastPoints?.completedAt,
    },
    alerts: {
      minioDown: !minioConnected,
      pelagicDown: pelagicConfigured() && !pelagicConnected,
      staleSync: settings.syncEnabled && (hoursSinceSync == null || hoursSinceSync > 48),
      consecutiveIssues: recentFailures >= 3,
    },
  };
}
