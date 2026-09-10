import { PelagicIntegrationSettings } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { resolveSchedule } from '../utils/cronSchedule';

async function repairScheduleIfNeeded(
  settings: PelagicIntegrationSettings
): Promise<PelagicIntegrationSettings> {
  const resolved = resolveSchedule({
    syncTime: settings.syncTime,
    syncCron: settings.syncCron,
  });
  if (settings.syncTime === resolved.syncTime && settings.syncCron === resolved.syncCron) {
    return settings;
  }
  return prisma.pelagicIntegrationSettings.update({
    where: { id: settings.id },
    data: {
      syncTime: resolved.syncTime,
      syncCron: resolved.syncCron,
    },
  });
}

export async function getIntegrationSettings() {
  let settings = await prisma.pelagicIntegrationSettings.findUnique({ where: { id: 'default' } });
  if (!settings) {
    const defaults = resolveSchedule({ syncCron: env.pelagic.syncCron });
    settings = await prisma.pelagicIntegrationSettings.create({
      data: {
        id: 'default',
        syncEnabled: env.pelagic.syncEnabled,
        syncCron: defaults.syncCron,
        syncTime: defaults.syncTime,
        syncIntervalDays: 1,
        syncTimezone: env.pelagic.syncTimezone,
        defaultImeis: env.pelagic.defaultImeis,
        defaultTags: env.pelagic.defaultTags,
        deviceInfo: env.pelagic.deviceInfo,
        withLastSeen: env.pelagic.withLastSeen,
        includeErrant: env.pelagic.includeErrant,
      },
    });
    return settings;
  }
  return repairScheduleIfNeeded(settings);
}

export async function updateIntegrationSettings(
  input: {
    syncEnabled?: boolean;
    syncCron?: string;
    syncTime?: string;
    syncIntervalDays?: number;
    syncTimezone?: string;
    defaultImeis?: string[];
    defaultTags?: string[];
    deviceInfo?: boolean;
    withLastSeen?: boolean;
    includeErrant?: boolean;
    retentionDays?: number | null;
  },
  updatedBy?: string
) {
  await getIntegrationSettings();

  const schedulePatch =
    input.syncTime !== undefined || input.syncCron !== undefined
      ? resolveSchedule({
          syncTime: input.syncTime,
          syncCron: input.syncCron,
        })
      : null;

  return prisma.pelagicIntegrationSettings.update({
    where: { id: 'default' },
    data: {
      ...input,
      ...(schedulePatch
        ? { syncTime: schedulePatch.syncTime, syncCron: schedulePatch.syncCron }
        : {}),
      updatedBy,
    },
  });
}

export async function markLastSync(status: 'SUCCESS' | 'FAILED' | 'PARTIAL', at = new Date()) {
  await getIntegrationSettings();
  return prisma.pelagicIntegrationSettings.update({
    where: { id: 'default' },
    data: { lastSyncAt: at, lastSyncStatus: status },
  });
}
