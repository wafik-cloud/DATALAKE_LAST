import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { assertSyncProducedResults, pelagicImportOrchestrator } from '../services/pelagicImportOrchestrator';
import { getIntegrationSettings, markLastSync } from '../repositories/integrationSettingsRepository';
import { writeAuditLog } from '../repositories/auditLogRepository';
import { getYesterdayInTimezone } from '../utils/dates';
import { serializeSyncRun } from '../utils/serializeJob';
import { cronToTime, getNextDailyRun } from '../utils/cronSchedule';
import { prisma } from '../lib/prisma';

let scheduled = false;
let scheduledTask: ScheduledTask | null = null;
let schedulerCron: string | null = null;
let schedulerTimezone: string | null = null;
let lastSchedulerError: string | null = null;
let lastCronTriggeredAt: string | null = null;

export function getSchedulerStatus() {
  const time = schedulerCron ? cronToTime(schedulerCron) : null;
  return {
    active: scheduled && scheduledTask !== null,
    cron: schedulerCron,
    timezone: schedulerTimezone,
    time,
    nextRunAt:
      scheduled && time && schedulerTimezone
        ? getNextDailyRun(time, schedulerTimezone).toISOString()
        : null,
    lastCronTriggeredAt,
    lastSchedulerError,
  };
}

export async function runDailyPelagicSync(triggeredBy = 'scheduler') {
  const settings = await getIntegrationSettings();
  if (!settings.syncEnabled) {
    console.log(`[scheduler] Sync ignorée (${triggeredBy}) — synchronisation désactivée`);
    return { skipped: true, reason: 'Synchronisation désactivée' };
  }

  const date = getYesterdayInTimezone(settings.syncTimezone);
  console.log(`[scheduler] Déclenchement sync (${triggeredBy}) pour la veille: ${date}`);

  try {
    const run = await pelagicImportOrchestrator.runSync(
      {
        dateFrom: date,
        dateTo: date,
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
    await markLastSync(status);
    await writeAuditLog(
      'PELAGIC_DAILY_SYNC',
      triggeredBy,
      `Période ${date}${run.failures.length ? ` (${run.failures.length} échec(s))` : ''}`
    );
    if (triggeredBy === 'cron') lastCronTriggeredAt = new Date().toISOString();
    console.log(`[scheduler] Sync terminée (${triggeredBy}) — ${status} — ${date}`);
    return { skipped: false, date, ...serializeSyncRun(run) };
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
  const time = settings.syncTime || cronToTime(settings.syncCron);
  const nextRunAt = getNextDailyRun(time, settings.syncTimezone).toISOString();
  console.log(
    `[scheduler] Pelagic actif: "${settings.syncCron}" (${settings.syncTimezone}) — prochaine exécution: ${nextRunAt}`
  );
}

export async function restartPelagicScheduler() {
  await startPelagicScheduler();
}

export async function getLastAutomaticSync() {
  return prisma.adminAuditLog.findFirst({
    where: {
      action: { in: ['PELAGIC_DAILY_SYNC', 'PELAGIC_DAILY_SYNC_FAILED'] },
      actor: 'cron',
    },
    orderBy: { createdAt: 'desc' },
  });
}
