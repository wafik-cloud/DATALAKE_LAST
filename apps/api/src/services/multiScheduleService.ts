import cron, { type ScheduledTask } from 'node-cron';
import { PelagicExportType, ScheduleFrequency, ScheduleRunStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { pelagicImportOrchestrator } from './pelagicImportOrchestrator';
import { formatDateInTimezone } from '../utils/dates';
import { writeAuditLog } from '../repositories/auditLogRepository';

export type ScheduleInput = {
  name: string;
  description?: string | null;
  enabled?: boolean;
  frequency: ScheduleFrequency;
  cron: string;
  timezone: string;
  exportTypes: PelagicExportType[];
  intervalDays: number;
  startDate?: string | null;
  endDate?: string | null;
  imeis?: string[];
  tags?: string[];
  deviceInfo?: boolean;
  withLastSeen?: boolean;
  includeErrant?: boolean;
  catchupMissing?: boolean;
  maxRetries?: number;
};

const tasks = new Map<string, ScheduledTask>();

function validateInput(input: ScheduleInput) {
  if (!input.name?.trim()) throw new Error('Le nom de la planification est requis');
  if (!cron.validate(input.cron)) throw new Error('Expression CRON invalide');
  if (!input.timezone) throw new Error('Le fuseau horaire est requis');
  if (!input.exportTypes?.length) throw new Error('Sélectionnez au moins un type d export');
  if (!Number.isInteger(input.intervalDays) || input.intervalDays < 1 || input.intervalDays > 30) {
    throw new Error('L intervalle doit être compris entre 1 et 30 jours');
  }
  if (input.maxRetries != null && (!Number.isInteger(input.maxRetries) || input.maxRetries < 0 || input.maxRetries > 10)) {
    throw new Error('Le nombre de tentatives doit être compris entre 0 et 10');
  }
}

function previousDay(timezone: string): string {
  const today = formatDateInTimezone(new Date(), timezone);
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function listSchedules() {
  return prisma.pelagicSchedule.findMany({
    orderBy: [{ enabled: 'desc' }, { createdAt: 'asc' }],
    include: { runs: { orderBy: { startedAt: 'desc' }, take: 5 } },
  });
}

export async function createSchedule(input: ScheduleInput, actor: string) {
  validateInput(input);
  const schedule = await prisma.pelagicSchedule.create({
    data: { ...input, name: input.name.trim(), createdBy: actor, updatedBy: actor },
  });
  await refreshScheduleTask(schedule.id);
  await writeAuditLog('PELAGIC_SCHEDULE_CREATE', actor, `${schedule.name}; ${schedule.cron}`);
  return schedule;
}

export async function updateSchedule(id: string, input: ScheduleInput, actor: string) {
  validateInput(input);
  const schedule = await prisma.pelagicSchedule.update({
    where: { id },
    data: { ...input, name: input.name.trim(), updatedBy: actor },
  });
  await refreshScheduleTask(id);
  await writeAuditLog('PELAGIC_SCHEDULE_UPDATE_V2', actor, `${schedule.name}; ${schedule.cron}`);
  return schedule;
}

export async function deleteSchedule(id: string, actor: string) {
  const schedule = await prisma.pelagicSchedule.delete({ where: { id } });
  tasks.get(id)?.stop();
  tasks.delete(id);
  await writeAuditLog('PELAGIC_SCHEDULE_DELETE', actor, schedule.name);
  return schedule;
}

export async function duplicateSchedule(id: string, actor: string) {
  const source = await prisma.pelagicSchedule.findUniqueOrThrow({ where: { id } });
  return createSchedule({
    name: `${source.name} (copie)`, description: source.description, enabled: false,
    frequency: source.frequency, cron: source.cron, timezone: source.timezone,
    exportTypes: source.exportTypes, intervalDays: source.intervalDays,
    startDate: source.startDate, endDate: source.endDate, imeis: source.imeis, tags: source.tags,
    deviceInfo: source.deviceInfo, withLastSeen: source.withLastSeen,
    includeErrant: source.includeErrant, catchupMissing: source.catchupMissing, maxRetries: source.maxRetries,
  }, actor);
}

export async function runSchedule(id: string, actor = 'scheduler') {
  const schedule = await prisma.pelagicSchedule.findUniqueOrThrow({ where: { id } });
  const targetDay = previousDay(schedule.timezone);
  const dateFrom = schedule.startDate && schedule.startDate > targetDay ? schedule.startDate : targetDay;
  const dateTo = schedule.endDate && schedule.endDate < targetDay ? schedule.endDate : targetDay;

  if (dateFrom > dateTo) {
    const run = await prisma.pelagicScheduleRun.create({
      data: { scheduleId: id, status: ScheduleRunStatus.SKIPPED, dateFrom, dateTo, completedAt: new Date(), errorMessage: 'Période hors des bornes de la planification' },
    });
    return run;
  }

  const run = await prisma.pelagicScheduleRun.create({ data: { scheduleId: id, dateFrom, dateTo } });
  try {
    const result = await pelagicImportOrchestrator.runSync({
      exportTypes: schedule.exportTypes, dateFrom, dateTo, imeis: schedule.imeis, tags: schedule.tags,
      deviceInfo: schedule.deviceInfo, withLastSeen: schedule.withLastSeen,
      includeErrant: schedule.includeErrant, intervalDays: schedule.intervalDays as 1 | 7 | 15 | 30,
      scheduleRunId: run.id,
    }, `schedule:${schedule.id}`);
    const jobs = result.results.flatMap((item) => item.job ? [item.job] : []);
    const status = result.failures.length ? (jobs.length ? ScheduleRunStatus.PARTIAL : ScheduleRunStatus.FAILED) : ScheduleRunStatus.SUCCESS;
    const updated = await prisma.pelagicScheduleRun.update({
      where: { id: run.id },
      data: {
        status, completedAt: new Date(), jobsCreated: result.results.filter((item) => !item.skipped).length,
        jobsSkipped: result.results.filter((item) => item.skipped).length, jobsFailed: result.failures.length,
        rowsImported: jobs.reduce((sum, job) => sum + (job.rowCount || 0), 0),
        bytesImported: jobs.reduce((sum, job) => sum + (job.fileSize || BigInt(0)), BigInt(0)),
        errorMessage: result.failures.length ? result.failures.map((failure) => failure.error).join('; ') : null,
      },
    });
    await prisma.pelagicSchedule.update({ where: { id }, data: { lastRunAt: new Date(), lastRunStatus: status } });
    await writeAuditLog('PELAGIC_SCHEDULE_RUN', actor, `${schedule.name}; ${status}; ${dateFrom}`);
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Exécution échouée';
    const updated = await prisma.pelagicScheduleRun.update({ where: { id: run.id }, data: { status: ScheduleRunStatus.FAILED, completedAt: new Date(), errorMessage: message } });
    await prisma.pelagicSchedule.update({ where: { id }, data: { lastRunAt: new Date(), lastRunStatus: ScheduleRunStatus.FAILED } });
    throw Object.assign(new Error(message), { run: updated });
  }
}

async function refreshScheduleTask(id: string) {
  tasks.get(id)?.stop();
  tasks.delete(id);
  const schedule = await prisma.pelagicSchedule.findUnique({ where: { id } });
  if (!schedule?.enabled || !cron.validate(schedule.cron)) return;
  const task = cron.schedule(schedule.cron, () => {
    runSchedule(id).catch((error) => console.error(`[schedule:${id}]`, error instanceof Error ? error.message : error));
  }, { timezone: schedule.timezone });
  tasks.set(id, task);
}

export async function startMultiScheduleRegistry() {
  tasks.forEach((task) => task.stop());
  tasks.clear();
  const enabled = await prisma.pelagicSchedule.findMany({ where: { enabled: true }, select: { id: true } });
  await Promise.all(enabled.map(({ id }) => refreshScheduleTask(id)));
  console.log(`[scheduler] ${tasks.size} planification(s) multiple(s) active(s)`);
}
