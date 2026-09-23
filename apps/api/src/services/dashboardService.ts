import { PelagicJobStatus, PelagicExportType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { minioStorageService } from './minioStorageService';
import { env, pelagicConfigured } from '../config/env';
import { getIntegrationSettings } from '../repositories/integrationSettingsRepository';
import { maskSecret } from '../utils/maskSecret';

export async function getDashboardStats() {
  const settings = await getIntegrationSettings();

  const [successCount, failedCount, runningCount, lastTrips, lastPoints, objects, allJobs, schedules] = await Promise.all([
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
    prisma.pelagicImportJob.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.pelagicSchedule.count({ where: { enabled: true } }),
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
  const successfulJobs = allJobs.filter((job) => job.status === PelagicJobStatus.SUCCESS && (job.rowCount || 0) > 0);
  const totalRows = successfulJobs.reduce((sum, job) => sum + (job.rowCount || 0), 0);
  const totalBytes = successfulJobs.reduce((sum, job) => sum + Number(job.fileSize || 0), 0);
  const completedJobs = allJobs.filter((job) => job.status === PelagicJobStatus.SUCCESS || job.status === PelagicJobStatus.FAILED);
  const successRate = completedJobs.length ? Math.round((successCount / completedJobs.length) * 100) : 0;
  const dates = successfulJobs.flatMap((job) => [job.dateFrom.slice(0, 10), job.dateTo.slice(0, 10)]).sort();
  const storageByType = ['points', 'trips', 'previews', 'manifests', 'errors'].map((type) => {
    const matches = objects.filter((item) => item.name?.startsWith(`${type}/`));
    return { type, files: matches.length, bytes: matches.reduce((sum, item) => sum + (item.size || 0), 0) };
  });
  const monthlyMap = new Map<string, { month: string; rows: number; bytes: number; jobs: number; failures: number }>();
  allJobs.forEach((job) => {
    const month = job.dateFrom.slice(0, 7);
    const current = monthlyMap.get(month) || { month, rows: 0, bytes: 0, jobs: 0, failures: 0 };
    current.jobs += 1;
    current.rows += job.rowCount || 0;
    current.bytes += Number(job.fileSize || 0);
    if (job.status === PelagicJobStatus.FAILED) current.failures += 1;
    monthlyMap.set(month, current);
  });
  const monthlyActivity = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
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
      totalRows,
      totalBytes,
      successRate,
      total: allJobs.length,
    },
    science: {
      temporalStart: dates[0] || null,
      temporalEnd: dates[dates.length - 1] || null,
      activeSchedules: schedules,
      pointRows: successfulJobs.filter((job) => job.exportType === PelagicExportType.points).reduce((sum, job) => sum + (job.rowCount || 0), 0),
      tripRows: successfulJobs.filter((job) => job.exportType === PelagicExportType.trips).reduce((sum, job) => sum + (job.rowCount || 0), 0),
    },
    storageByType,
    monthlyActivity,
    alerts: {
      minioDown: !minioConnected,
      pelagicDown: pelagicConfigured() && !pelagicConnected,
      staleSync: settings.syncEnabled && (hoursSinceSync == null || hoursSinceSync > 48),
      consecutiveIssues: recentFailures >= 3,
    },
  };
}
