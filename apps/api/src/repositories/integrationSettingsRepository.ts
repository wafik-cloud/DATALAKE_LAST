import { prisma } from '../lib/prisma';
import { env } from '../config/env';

export async function getIntegrationSettings() {
  let settings = await prisma.pelagicIntegrationSettings.findUnique({ where: { id: 'default' } });
  if (!settings) {
    settings = await prisma.pelagicIntegrationSettings.create({
      data: {
        id: 'default',
        syncEnabled: env.pelagic.syncEnabled,
        syncCron: env.pelagic.syncCron,
        syncTime: '01:00',
        syncIntervalDays: 1,
        syncTimezone: env.pelagic.syncTimezone,
        defaultImeis: env.pelagic.defaultImeis,
        defaultTags: env.pelagic.defaultTags,
        deviceInfo: env.pelagic.deviceInfo,
        withLastSeen: env.pelagic.withLastSeen,
        includeErrant: env.pelagic.includeErrant,
      },
    });
  }
  return settings;
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
  return prisma.pelagicIntegrationSettings.update({
    where: { id: 'default' },
    data: { ...input, updatedBy },
  });
}

export async function markLastSync(status: 'SUCCESS' | 'FAILED' | 'PARTIAL', at = new Date()) {
  await getIntegrationSettings();
  return prisma.pelagicIntegrationSettings.update({
    where: { id: 'default' },
    data: { lastSyncAt: at, lastSyncStatus: status },
  });
}
