import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { assertSyncProducedResults, pelagicImportOrchestrator } from '../services/pelagicImportOrchestrator';
import { getIntegrationSettings, markLastSync } from '../repositories/integrationSettingsRepository';
import { writeAuditLog } from '../repositories/auditLogRepository';
import { getLast24HoursRangeInTimezone } from '../utils/dates';
import { serializeSyncRun } from '../utils/serializeJob';
import { cronToTime, getNextDailyRun, resolveSchedule } from '../utils/cronSchedule';
import { prisma } from '../lib/prisma';

let scheduled = false;
let scheduledTask: ScheduledTask | null = null;
let schedulerCron: string | null = null;
let schedulerTimezone: string | null = null;
let lastSchedulerError: string | null = null;
let lastCronTriggeredAt: string | null = null;

export function getSchedulerStatus() {
  return {
    active: scheduled && scheduledTask !== null,
    cron: schedulerCron,
    timezone: schedulerTimezone,
    time: schedulerCron ? cronToTime(schedulerCron) : null,
    nextRunAt: null as string | null,
    lastCronTriggeredAt,
    lastSchedulerError,
  };
}

export async function getSchedulerStatusResolved() {
  const settings = await getIntegrationSettings();
  const schedule = resolveSchedule(settings);
  const base = getSchedulerStatus();
  return {
    ...base,
    cron: schedule.syncCron,
    time: schedule.syncTime,
    timezone: settings.syncTimezone,
    nextRunAt:
      base.active && settings.syncEnabled
        ? getNextDailyRun(schedule.syncTime, settings.syncTimezone).toISOString()
        : null,
  };
}

export async function runDailyPelagicSync(triggeredBy = 'scheduler') {
  const settings = await getIntegrationSettings();
  if (!settings.syncEnabled) {
    console.log(`[scheduler] Sync ignorée (${triggeredBy}) — synchronisation désactivée`);
    if (triggeredBy === 'cron') {
      await writeAuditLog('PELAGIC_DAILY_SYNC_SKIPPED', triggeredBy, 'Synchronisation désactivée');
    }
    return { skipped: true, reason: 'Synchronisation désactivée' };
  }

  const { dateFrom, dateTo } = getLast24HoursRangeInTimezone(settings.syncTimezone);
  console.log(`[scheduler] Déclenchement sync (${triggeredBy}) dernières 24h: ${dateFrom} → ${dateTo}`);
  if (triggeredBy === 'cron') {
    await writeAuditLog('PELAGIC_DAILY_SYNC_TRIGGERED', triggeredBy, `Période ${dateFrom} → ${dateTo}`);
  }

  try {
    const run = await pelagicImportOrchestrator.runSync(
      {
        dateFrom,
        dateTo,
        imeis: settings.defaultImeis,
        tags: settings.defaultTags,
        deviceInfo: settings.deviceInfo,
        withLastSeen: settings.withLastSeen,
        includeErrant: settings.includeErrant,
        exportTypes: env.pelagic.syncExportTypes,
        force: false,
        intervalDays: (settings.syncIntervalDays || 1) as 1 | 7 | 15 | 30,
      },
      triggeredBy
    );

    assertSyncProducedResults(run);

    const status = run.failures.length ? 'PARTIAL' : 'SUCCESS';
    const importedCount = run.results.filter((result) => !result.skipped).length;
    const skippedCount = run.results.filter((result) => result.skipped).length;
    await markLastSync(status);
    await writeAuditLog(
      'PELAGIC_DAILY_SYNC',
      triggeredBy,
      `Période ${dateFrom} → ${dateTo}; fichiers créés: ${importedCount}; ignorés: ${skippedCount}${run.failures.length ? `; échecs: ${run.failures.length}` : ''}`
    );
    if (triggeredBy === 'cron') lastCronTriggeredAt = new Date().toISOString();
    console.log(`[scheduler] Sync terminée (${triggeredBy}) — ${status} — ${dateFrom} → ${dateTo}`);
    return { skipped: false, dateFrom, dateTo, ...serializeSyncRun(run) };
  } catch (error) {
    await markLastSync('FAILED');
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    await writeAuditLog('PELAGIC_DAILY_SYNC_FAILED', triggeredBy, message);
    console.error(`[scheduler] Sync échouée (${triggeredBy}):`, message);
    throw error;
  }
}

export async function startPelagicScheduler() {
  const settings = await getIntegrationSettings();

  if (!settings.syncEnabled) {
    if (scheduledTask) {
      scheduledTask.stop();
      scheduledTask = null;
    }
    scheduled = false;
    schedulerCron = settings.syncCron;
    schedulerTimezone = settings.syncTimezone;
  }

  if (!settings.syncEnabled) {
    console.log('[scheduler] Pelagic inactif — synchronisation désactivée dans les paramètres');
    return;
  }

  if (!cron.validate(settings.syncCron)) {
    lastSchedulerError = `CRON invalide: ${settings.syncCron}`;
    console.warn(`[scheduler] ${lastSchedulerError}`);
    return;
  }

  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    scheduled = false;
  }

  schedulerCron = settings.syncCron;
  schedulerTimezone = settings.syncTimezone;
  lastSchedulerError = null;

  scheduledTask = cron.schedule(
    settings.syncCron,
    () => {
      lastCronTriggeredAt = new Date().toISOString();
      runDailyPelagicSync('cron').catch((error) => {
        lastSchedulerError = error instanceof Error ? error.message : String(error);
        console.error('[scheduler] Échec sync quotidienne:', lastSchedulerError);
      });
    },
    { timezone: settings.syncTimezone }
  );

  scheduled = true;
  const schedule = resolveSchedule(settings);
  const nextRunAt = getNextDailyRun(schedule.syncTime, settings.syncTimezone).toISOString();
  console.log(
    `[scheduler] Pelagic actif: ${schedule.syncTime} (${settings.syncTimezone}) cron="${schedule.syncCron}" — prochaine exécution: ${nextRunAt}`
  );
}

export async function restartPelagicScheduler() {
  await startPelagicScheduler();
}

export async function getLastAutomaticSync() {
  return prisma.adminAuditLog.findFirst({
    where: {
      action: {
        in: [
          'PELAGIC_DAILY_SYNC_TRIGGERED',
          'PELAGIC_DAILY_SYNC',
          'PELAGIC_DAILY_SYNC_SKIPPED',
          'PELAGIC_DAILY_SYNC_FAILED',
        ],
      },
      actor: 'cron',
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getRecentAutomaticSyncEvents(limit = 12) {
  return prisma.adminAuditLog.findMany({
    where: {
      action: {
        in: [
          'PELAGIC_DAILY_SYNC_TRIGGERED',
          'PELAGIC_DAILY_SYNC',
          'PELAGIC_DAILY_SYNC_SKIPPED',
          'PELAGIC_DAILY_SYNC_FAILED',
        ],
      },
      actor: 'cron',
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
