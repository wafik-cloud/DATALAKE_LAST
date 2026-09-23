import { Router } from 'express';
import { PelagicJobStatus, ScheduleFrequency } from '@prisma/client';
import { env, pelagicConfigured } from '../../config/env';
import { maskSecret } from '../../utils/maskSecret';
import { prisma } from '../../lib/prisma';
import { pelagicDataService } from '../../services/pelagicDataService';
import { assertSyncProducedResults, pelagicImportOrchestrator } from '../../services/pelagicImportOrchestrator';
import { requireAdmin } from '../../middleware/requireAdmin';
import { rateLimit } from '../../middleware/rateLimit';
import { runDailyPelagicSync, restartPelagicScheduler, getSchedulerStatusResolved, getLastAutomaticSync, getRecentAutomaticSyncEvents } from '../../jobs/pelagicSyncScheduler';
import {
  getJobById,
  listJobs,
  markJobCancelled,
  countActiveRunningJobs,
} from '../../repositories/pelagicImportJobRepository';
import {
  getIntegrationSettings,
  updateIntegrationSettings,
} from '../../repositories/integrationSettingsRepository';
import { writeAuditLog } from '../../repositories/auditLogRepository';
import { PelagicExportType } from '../../types/pelagic';
import { serializeSyncRun } from '../../utils/serializeJob';
import { describeSchedule, resolveSchedule, timeToCron } from '../../utils/cronSchedule';
import { getMonthlyImportOverview, getMonthDateRange } from '../../services/monthlyImportService';
import { getMonthPlanInterval, upsertMonthPlan } from '../../repositories/monthPlanRepository';
import { getMapPreviewSourceRow, getOrCreateMapPreview } from '../../services/mapPreviewService';
import { createSchedule, deleteSchedule, duplicateSchedule, listSchedules, runSchedule, updateSchedule } from '../../services/multiScheduleService';

const router = Router();
router.use(requireAdmin);

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

router.get('/settings', async (_req, res) => {
  const settings = await getIntegrationSettings();
  const schedule = resolveSchedule(settings);
  res.json({
    baseUrl: env.pelagic.baseUrl,
    token: maskSecret(env.pelagic.token),
    secret: maskSecret(env.pelagic.secret),
    defaultImeis: settings.defaultImeis,
    defaultTags: settings.defaultTags,
    deviceInfo: settings.deviceInfo,
    withLastSeen: settings.withLastSeen,
    includeErrant: settings.includeErrant,
    timeoutMs: env.pelagic.httpTimeoutMs,
    maxRetries: env.pelagic.maxRetries,
    syncEnabled: settings.syncEnabled,
    syncCron: schedule.syncCron,
    syncTime: schedule.syncTime,
    syncIntervalDays: settings.syncIntervalDays || 1,
    syncTimezone: settings.syncTimezone,
    scheduleDescription: describeSchedule(
      schedule.syncTime,
      settings.syncTimezone,
      settings.syncIntervalDays || 1
    ),
    retentionDays: settings.retentionDays,
    lastSyncAt: settings.lastSyncAt,
    lastSyncStatus: settings.lastSyncStatus,
    configured: pelagicConfigured(),
  });
});

router.get('/schedule', async (_req, res) => {
  const settings = await getIntegrationSettings();
  const schedule = resolveSchedule(settings);
  const intervalDays = settings.syncIntervalDays || 1;
  const scheduler = await getSchedulerStatusResolved();
  const lastAutomaticSync = await getLastAutomaticSync();

  const [recentCronJobs, runningJobs, recentCronEvents] = await Promise.all([
    prisma.pelagicImportJob.findMany({
      where: { createdBy: 'cron' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        exportType: true,
        status: true,
        dateFrom: true,
        dateTo: true,
        errorMessage: true,
        rowCount: true,
        startedAt: true,
        completedAt: true,
        failedAt: true,
      },
    }),
    countActiveRunningJobs(),
    getRecentAutomaticSyncEvents(),
  ]);

  res.json({
    enabled: settings.syncEnabled,
    time: schedule.syncTime,
    timezone: settings.syncTimezone,
    intervalDays,
    cron: schedule.syncCron,
    description: describeSchedule(schedule.syncTime, settings.syncTimezone, intervalDays),
    lastSyncAt: settings.lastSyncAt,
    lastSyncStatus: settings.lastSyncStatus,
    exportTypes: env.pelagic.syncExportTypes,
    pointsEnabled: env.pelagic.syncExportTypes.includes('points'),
    runningJobs,
    recentCronJobs: recentCronJobs.map((job) => ({
      ...job,
      rowCount: job.rowCount ?? null,
    })),
    scheduler: {
      ...scheduler,
      nextRunAt:
        settings.syncEnabled && scheduler.active ? scheduler.nextRunAt : null,
    },
    lastAutomaticSync: lastAutomaticSync
      ? {
          at: lastAutomaticSync.createdAt,
          action: lastAutomaticSync.action,
          details: lastAutomaticSync.details,
        }
      : null,
    recentCronEvents: recentCronEvents.map((event) => ({
      id: event.id,
      action: event.action,
      details: event.details,
      createdAt: event.createdAt,
    })),
  });
});

router.put('/schedule', async (req, res) => {
  try {
    const body = req.body || {};
    const time = typeof body.time === 'string' ? body.time : undefined;
    const intervalDays = body.intervalDays != null ? Number(body.intervalDays) : undefined;

    if (intervalDays != null && (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 30)) {
      return res.status(400).json({ error: 'intervalDays doit être entre 1 et 30' });
    }

    const syncCron = time ? timeToCron(time) : undefined;
    const updated = await updateIntegrationSettings(
      {
        syncEnabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
        syncTime: time,
        syncCron,
        syncIntervalDays: intervalDays,
        syncTimezone: body.timezone,
      },
      req.header('X-User') || 'admin'
    );

    await restartPelagicScheduler();
    await writeAuditLog('PELAGIC_SCHEDULE_UPDATE', req.header('X-User') || 'admin', updated.syncCron);

    const scheduleTime = resolveSchedule(updated).syncTime;
    const scheduleCron = resolveSchedule(updated).syncCron;
    res.json({
      message: 'Planification enregistrée',
      schedule: {
        enabled: updated.syncEnabled,
        time: scheduleTime,
        timezone: updated.syncTimezone,
        intervalDays: updated.syncIntervalDays,
        cron: scheduleCron,
        description: describeSchedule(scheduleTime, updated.syncTimezone, updated.syncIntervalDays),
      },
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Planification invalide' });
  }
});

function scheduleInput(body: any) {
  return {
    name: String(body.name || ''), description: body.description ? String(body.description) : null,
    enabled: body.enabled !== false, frequency: String(body.frequency || 'DAILY') as ScheduleFrequency,
    cron: String(body.cron || ''), timezone: String(body.timezone || 'Africa/Casablanca'),
    exportTypes: (Array.isArray(body.exportTypes) ? body.exportTypes : ['trips', 'points']) as any,
    intervalDays: Number(body.intervalDays || 1), startDate: body.startDate || null, endDate: body.endDate || null,
    imeis: Array.isArray(body.imeis) ? body.imeis.map(String) : [], tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    deviceInfo: body.deviceInfo !== false, withLastSeen: body.withLastSeen !== false,
    includeErrant: body.includeErrant === true, catchupMissing: body.catchupMissing !== false,
    maxRetries: Number(body.maxRetries ?? 3),
  };
}

router.get('/schedules', async (_req, res) => {
  try {
    const schedules = await listSchedules();
    res.json({ schedules: schedules.map((schedule) => ({ ...schedule, runs: schedule.runs.map((run) => ({ ...run, bytesImported: run.bytesImported.toString() })) })) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Planifications indisponibles' });
  }
});

router.post('/schedules', async (req, res) => {
  try {
    const schedule = await createSchedule(scheduleInput(req.body || {}), req.header('X-User') || 'admin');
    res.status(201).json(schedule);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Planification invalide' });
  }
});

router.put('/schedules/:id', async (req, res) => {
  try {
    const schedule = await updateSchedule(paramId(req.params.id), scheduleInput(req.body || {}), req.header('X-User') || 'admin');
    res.json(schedule);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Planification invalide' });
  }
});

router.post('/schedules/:id/duplicate', async (req, res) => {
  try { res.status(201).json(await duplicateSchedule(paramId(req.params.id), req.header('X-User') || 'admin')); }
  catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : 'Planification introuvable' }); }
});

router.post('/schedules/:id/run', rateLimit(3), async (req, res) => {
  try {
    const run = await runSchedule(paramId(req.params.id), req.header('X-User') || 'admin');
    res.json({ ...run, bytesImported: run.bytesImported.toString() });
  } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : 'Exécution échouée' }); }
});

router.delete('/schedules/:id', async (req, res) => {
  try { res.json(await deleteSchedule(paramId(req.params.id), req.header('X-User') || 'admin')); }
  catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : 'Planification introuvable' }); }
});

router.get('/months', async (req, res) => {
  try {
    const fromYear = Math.max(2020, Number(req.query.fromYear || 2020));
    const overview = await getMonthlyImportOverview(fromYear);
    res.json(overview);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erreur calendrier mensuel' });
  }
});

router.put('/months/:year/:month/plan', async (req, res) => {
  try {
    const year = Number(paramId(req.params.year));
    const month = Number(paramId(req.params.month));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Année ou mois invalide' });
    }

    const intervalDays = Number(req.body?.intervalDays);
    if (!Number.isInteger(intervalDays)) {
      return res.status(400).json({ error: 'intervalDays requis (1, 7, 15 ou 30)' });
    }

    const plan = await upsertMonthPlan(
      year,
      month,
      intervalDays,
      req.header('X-User') || 'admin'
    );

    await writeAuditLog(
      'PELAGIC_MONTH_PLAN_UPDATE',
      req.header('X-User') || 'admin',
      `${year}-${String(month).padStart(2, '0')} → ${intervalDays}j`
    );

    res.json({
      message: 'Intervalle mensuel enregistré',
      plan: {
        year: plan.year,
        month: plan.month,
        intervalDays: plan.intervalDays,
      },
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Plan mensuel invalide' });
  }
});

router.post('/months/:year/:month/sync', rateLimit(3), async (req, res) => {
  try {
    const year = Number(paramId(req.params.year));
    const month = Number(paramId(req.params.month));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Année ou mois invalide' });
    }

    const settings = await getIntegrationSettings();
    const { dateFrom, dateTo } = getMonthDateRange(year, month);
    const body = req.body || {};
    const savedInterval = await getMonthPlanInterval(year, month);
    const intervalDays =
      body.intervalDays ?? savedInterval ?? settings.syncIntervalDays ?? 1;

    const run = await pelagicImportOrchestrator.runSync(
      {
        exportTypes: body.exportTypes as PelagicExportType[] | undefined,
        dateFrom,
        dateTo,
        imeis: settings.defaultImeis,
        tags: settings.defaultTags,
        deviceInfo: settings.deviceInfo,
        withLastSeen: settings.withLastSeen,
        includeErrant: settings.includeErrant,
        force: body.force === true,
        intervalDays,
      },
      req.header('X-User') || 'admin'
    );

    await writeAuditLog(
      'PELAGIC_MONTH_SYNC',
      req.header('X-User') || 'admin',
      `${year}-${String(month).padStart(2, '0')} (${dateFrom} → ${dateTo})`
    );

    res.json({
      message: run.failures.length ? 'Import mensuel partiel' : 'Import mensuel terminé',
      dateFrom,
      dateTo,
      ...serializeSyncRun(run),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Import mensuel échoué' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const body = req.body || {};
    const updated = await updateIntegrationSettings(
      {
        syncEnabled: body.syncEnabled,
        syncCron: body.syncCron,
        syncTimezone: body.syncTimezone,
        defaultImeis: Array.isArray(body.defaultImeis) ? body.defaultImeis : undefined,
        defaultTags: Array.isArray(body.defaultTags) ? body.defaultTags : undefined,
        deviceInfo: body.deviceInfo,
        withLastSeen: body.withLastSeen,
        includeErrant: body.includeErrant,
        retentionDays: body.retentionDays,
      },
      req.header('X-User') || 'admin'
    );
    await writeAuditLog('PELAGIC_SETTINGS_UPDATE', req.header('X-User') || 'admin');
    res.json({
      message: 'Paramètres enregistrés (secrets inchangés — .env uniquement)',
      settings: updated,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Mise à jour impossible' });
  }
});

router.post('/test', rateLimit(5), async (_req, res) => {
  try {
    if (!pelagicConfigured()) {
      return res.status(400).json({ ok: false, message: 'Token/secret Pelagic non configurés' });
    }
    const result = await pelagicDataService.testConnection();
    res.status(result.ok ? 200 : 503).json(result);
  } catch (error) {
    res.status(503).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Test Pelagic échoué',
      tests: [],
    });
  }
});

router.post('/sync/now', rateLimit(3), async (req, res) => {
  try {
    const result = await runDailyPelagicSync(req.header('X-User') || 'admin');
    const partial = 'failures' in result && Array.isArray(result.failures) && result.failures.length > 0;
    res.json({
      message: partial ? 'Synchronisation quotidienne partielle' : 'Synchronisation quotidienne lancée',
      ...result,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Sync quotidienne échouée' });
  }
});

router.post('/sync', rateLimit(5), async (req, res) => {
  try {
    const body = req.body || {};
    const exportTypes = body.exportTypes as PelagicExportType[] | undefined;

    const run = await pelagicImportOrchestrator.runSync(
      {
        exportTypes,
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
        imeis: body.imeis,
        tags: body.tags,
        deviceInfo: body.deviceInfo,
        withLastSeen: body.withLastSeen,
        includeErrant: body.includeErrant,
        force: body.force === true,
        intervalDays: body.intervalDays,
      },
      req.header('X-User') || 'admin'
    );

    if (run.results.length === 0) {
      return res.status(500).json({ error: 'Synchronisation échouée', failures: run.failures });
    }

    await writeAuditLog('PELAGIC_MANUAL_SYNC', req.header('X-User') || 'admin', `${body.dateFrom} → ${body.dateTo}`);

    res.json({
      message: run.failures.length ? 'Synchronisation partielle' : 'Synchronisation terminée',
      ...serializeSyncRun(run),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Synchronisation échouée',
    });
  }
});

router.get('/jobs', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
    const status = req.query.status as PelagicJobStatus | undefined;
    const exportType = req.query.exportType as PelagicExportType | undefined;

    const { items, total } = await listJobs({
      page,
      pageSize,
      status,
      exportType,
      imei: typeof req.query.imei === 'string' ? req.query.imei : undefined,
      createdBy: typeof req.query.createdBy === 'string' ? req.query.createdBy : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
    });
    res.json({
      items: items.map((job) => ({
        ...job,
        fileSize: job.fileSize?.toString(),
      })),
      page,
      pageSize,
      total,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erreur liste jobs' });
  }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await getJobById(paramId(req.params.id));
    if (!job) return res.status(404).json({ error: 'Traitement introuvable' });
    res.json({ ...job, fileSize: job.fileSize?.toString() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erreur détail job' });
  }
});

router.get('/jobs/:id/map-preview', async (req, res) => {
  try {
    const job = await getJobById(paramId(req.params.id));
    if (!job) return res.status(404).json({ error: 'Traitement introuvable' });
    if (job.exportType !== 'points') {
      return res.status(400).json({ error: 'La carte est disponible uniquement pour les fichiers points' });
    }
    if (job.status !== 'SUCCESS' || !job.minioObjectKey) {
      return res.status(409).json({ error: 'Le fichier points n est pas disponible pour ce traitement' });
    }

    const preview = await getOrCreateMapPreview(job.minioObjectKey);
    res.json(preview);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Prévisualisation carte impossible' });
  }
});

router.get('/jobs/:id/map-row', async (req, res) => {
  try {
    const job = await getJobById(paramId(req.params.id));
    if (!job) return res.status(404).json({ error: 'Traitement introuvable' });
    if (job.exportType !== 'points' || !job.minioObjectKey) {
      return res.status(400).json({ error: 'Ligne carte disponible uniquement pour un fichier points' });
    }

    const sourceRow = Number(req.query.row);
    const detail = await getMapPreviewSourceRow(job.minioObjectKey, sourceRow);
    res.json(detail);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Détail de ligne impossible' });
  }
});

router.post('/jobs/:id/retry', rateLimit(10), async (req, res) => {
  try {
    const job = await getJobById(paramId(req.params.id));
    if (!job) return res.status(404).json({ error: 'Traitement introuvable' });

    const result = await pelagicImportOrchestrator.runExport({
      exportType: job.exportType,
      dateFrom: job.dateFrom,
      dateTo: job.dateTo,
      imeis: job.imeis,
      tags: job.tags,
      deviceInfo: job.deviceInfo,
      withLastSeen: job.withLastSeen,
      errant: job.includeErrant,
      force: true,
      createdBy: req.header('X-User') || 'admin',
    });

    res.json({ message: 'Relance effectuée', result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Relance échouée' });
  }
});

router.post('/jobs/:id/cancel', async (req, res) => {
  try {
    const job = await getJobById(paramId(req.params.id));
    if (!job) return res.status(404).json({ error: 'Traitement introuvable' });
    if (job.status === 'RUNNING') {
      return res.status(409).json({ error: 'Impossible d\'annuler un traitement en cours' });
    }
    const updated = await markJobCancelled(job.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Annulation échouée' });
  }
});

export default router;
