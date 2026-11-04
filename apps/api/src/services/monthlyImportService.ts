import { PelagicExportType, PelagicJobStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { describeSchedule, resolveSchedule } from '../utils/cronSchedule';
import { getIntegrationSettings } from '../repositories/integrationSettingsRepository';
import { getMonthPlanMap } from '../repositories/monthPlanRepository';
import { env } from '../config/env';
import { getStorageExplorer } from './storageExplorerService';
import { buildCoverage, importInterval, localCoverageClock, DAY } from '../utils/importCoverage';

export type MonthImportStatus = 'complete' | 'partial' | 'pending' | 'future' | 'running';

export interface MonthSummary {
  year: number;
  month: number;
  key: string;
  label: string;
  dateFrom: string;
  dateTo: string;
  status: MonthImportStatus;
  totalDays: number;
  importedDays: number;
  failedDays: number;
  pendingDays: number;
  lastImportAt: string | null;
  scheduleTime: string;
  scheduleTimezone: string;
  intervalDays: number;
  defaultIntervalDays: number;
  intervalCustomized: boolean;
  canEditInterval: boolean;
  scheduleDescription: string;
}

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function padDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function listEligibleDays(year: number, month: number, today: string): string[] {
  const lastDay = daysInMonth(year, month);
  const days: string[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const date = padDate(year, month, day);
    if (date <= today) days.push(date);
  }
  return days;
}

function buildMonthSummary(
  base: Omit<
    MonthSummary,
    'intervalDays' | 'defaultIntervalDays' | 'intervalCustomized' | 'canEditInterval'
  >,
  defaultInterval: number,
  monthPlanMap: Map<string, number>
): MonthSummary {
  const planned = monthPlanMap.get(base.key);
  const canEditInterval = base.status !== 'complete' && base.status !== 'future';
  const effectiveInterval = planned ?? defaultInterval;

  return {
    ...base,
    intervalDays: effectiveInterval,
    defaultIntervalDays: defaultInterval,
    intervalCustomized: planned != null,
    canEditInterval,
  };
}

function monthIsFuture(year: number, month: number, today: string): boolean {
  const firstDay = padDate(year, month, 1);
  return firstDay > today;
}

export async function getMonthlyImportOverview(fromYear = 2020): Promise<{
  years: number[];
  months: MonthSummary[];
  schedule: {
    enabled: boolean;
    time: string;
    timezone: string;
    intervalDays: number;
    cron: string;
    description: string;
  };
}> {
  const settings = await getIntegrationSettings();
  const exportTypes: PelagicExportType[] = env.pelagic.syncExportTypes;
  const resolved = resolveSchedule(settings);
  const { today, lastDueDay } = localCoverageClock(new Date(), settings.syncTimezone, resolved.syncTime);
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));

  const scheduleTime = resolved.syncTime;
  const intervalDays = settings.syncIntervalDays || 1;
  const monthPlanMap = await getMonthPlanMap();
  const schedule = {
    enabled: settings.syncEnabled,
    time: scheduleTime,
    timezone: settings.syncTimezone,
    intervalDays,
    cron: resolved.syncCron,
    description: describeSchedule(scheduleTime, settings.syncTimezone, intervalDays),
  };

  const years: number[] = [];
  for (let year = fromYear; year <= currentYear; year++) years.push(year);

  const rangeStart = `${fromYear}-01-01`;
  const rangeEnd = `${currentYear}-12-31`;

  const jobs = await prisma.pelagicImportJob.findMany({
    where: {
      AND: [
        { dateTo: { gte: rangeStart } },
        { dateFrom: { lte: rangeEnd } },
      ],
      exportType: { in: exportTypes },
      status: { in: [PelagicJobStatus.SUCCESS, PelagicJobStatus.FAILED, PelagicJobStatus.RUNNING] },
    },
    select: {
      dateFrom: true,
      dateTo: true,
      status: true,
      exportType: true,
      completedAt: true,
      failedAt: true,
      updatedAt: true,
      imeis: true,
      tags: true,
    },
  });

  // Count existing CSVs, including imports predating the restored DB history.
  const { items, unreadableMetadata } = await getStorageExplorer();
  if (unreadableMetadata) throw new Error('Couverture indisponible : des métadonnées MinIO sont illisibles.');
  const available = items.filter(item => item.status === 'SUCCESS' && item.coverageEligible);
  const isCovered = buildCoverage(available, exportTypes, scheduleTime);
  const attempts = jobs.filter(job => job.imeis.length === 0 && job.tags.length === 0);
  const coveredByType = new Map(exportTypes.map(type => [type, buildCoverage(available, [type], scheduleTime)]));
  const hasUnresolvedAttempt = (status: PelagicJobStatus, day: string) => attempts.some(job =>
    job.status === status && buildCoverage([job], [job.exportType], scheduleTime)(day) &&
    !coveredByType.get(job.exportType)?.(day));

  const months: MonthSummary[] = [];

  for (const year of years) {
    const maxMonth = year === currentYear ? currentMonth : 12;
    const minMonth = year === fromYear ? 1 : 1;

    for (let month = minMonth; month <= maxMonth; month++) {
      const dateFrom = padDate(year, month, 1);
      const dateTo = padDate(year, month, daysInMonth(year, month));
      const eligibleDays = listEligibleDays(year, month, lastDueDay);

      if (monthIsFuture(year, month, today)) {
        months.push(
          buildMonthSummary(
            {
              year,
              month,
              key: `${year}-${String(month).padStart(2, '0')}`,
              label: `${MONTH_NAMES[month - 1]} ${year}`,
              dateFrom,
              dateTo,
              status: 'future',
              totalDays: eligibleDays.length,
              importedDays: 0,
              failedDays: 0,
              pendingDays: 0,
              lastImportAt: null,
              scheduleTime,
              scheduleTimezone: settings.syncTimezone,
              scheduleDescription: schedule.description,
            },
            intervalDays,
            monthPlanMap
          )
        );
        continue;
      }

      const imported = eligibleDays.filter((day) => isCovered(day)).length;
      const failed = eligibleDays.filter((day) => hasUnresolvedAttempt(PelagicJobStatus.FAILED, day) && !isCovered(day)).length;
      const running = eligibleDays.some((day) => hasUnresolvedAttempt(PelagicJobStatus.RUNNING, day));
      const pending = Math.max(0, eligibleDays.length - imported - failed);

      let status: MonthImportStatus = 'pending';
      if (running) status = 'running';
      else if (eligibleDays.length === 0) status = 'future';
      else if (imported === eligibleDays.length) status = 'complete';
      else if (imported > 0 || failed > 0) status = 'partial';

      const monthStart = Date.parse(`${dateFrom}T00:00:00Z`);
      const monthEnd = Date.parse(`${dateTo}T00:00:00Z`) + DAY;
      const monthLastImport = available
        .filter(item => {
          const range = importInterval(item);
          return range && range[0] < monthEnd && range[1] > monthStart;
        })
        .map(item => item.importedAt ? new Date(item.importedAt) : null)
        .filter((stamp): stamp is Date => stamp !== null && Number.isFinite(stamp.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0];

      months.push(
        buildMonthSummary(
          {
            year,
            month,
            key: `${year}-${String(month).padStart(2, '0')}`,
            label: `${MONTH_NAMES[month - 1]} ${year}`,
            dateFrom,
            dateTo: eligibleDays.length ? eligibleDays[eligibleDays.length - 1] : dateTo,
            status,
            totalDays: eligibleDays.length,
            importedDays: imported,
            failedDays: failed,
            pendingDays: pending,
            lastImportAt: monthLastImport ? monthLastImport.toISOString() : null,
            scheduleTime,
            scheduleTimezone: settings.syncTimezone,
            scheduleDescription: schedule.description,
          },
          intervalDays,
          monthPlanMap
        )
      );
    }
  }

  return {
    years,
    months: months.reverse(),
    schedule,
  };
}

export function getMonthDateRange(year: number, month: number): { dateFrom: string; dateTo: string } {
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = padDate(year, month, 1);
  const lastDay = daysInMonth(year, month);
  let dateTo = padDate(year, month, lastDay);
  if (dateTo > today) dateTo = today;
  return { dateFrom, dateTo };
}
