import { PelagicExportType, PelagicJobStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface CreateJobInput {
  exportType: PelagicExportType;
  dateFrom: string;
  dateTo: string;
  imeis?: string[];
  tags?: string[];
  deviceInfo?: boolean;
  withLastSeen?: boolean;
  includeErrant?: boolean;
  createdBy?: string;
  scheduleRunId?: string;
}

export async function createJob(input: CreateJobInput) {
  return prisma.pelagicImportJob.create({
    data: {
      exportType: input.exportType,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      imeis: input.imeis || [],
      tags: input.tags || [],
      deviceInfo: input.deviceInfo ?? true,
      withLastSeen: input.withLastSeen ?? true,
      includeErrant: input.includeErrant ?? false,
      createdBy: input.createdBy,
      scheduleRunId: input.scheduleRunId,
      status: PelagicJobStatus.PENDING,
    },
  });
}

export async function findSuccessfulDuplicate(input: CreateJobInput) {
  return prisma.pelagicImportJob.findFirst({
    where: {
      exportType: input.exportType,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      imeis: { equals: input.imeis || [] },
      tags: { equals: input.tags || [] },
      deviceInfo: input.deviceInfo ?? true,
      withLastSeen: input.withLastSeen ?? true,
      includeErrant: input.includeErrant ?? false,
      status: PelagicJobStatus.SUCCESS,
    },
  });
}

export async function markJobRunning(jobId: string) {
  return prisma.pelagicImportJob.update({
    where: { id: jobId },
    data: {
      status: PelagicJobStatus.RUNNING,
      startedAt: new Date(),
      attemptCount: { increment: 1 },
    },
  });
}

export async function markJobSuccess(
  jobId: string,
  data: {
    minioBucket: string;
    minioObjectKey: string;
    fileName: string;
    fileSize: bigint;
    checksumSha256: string;
    httpStatus: number;
    rowCount?: number;
    errorMessage?: string;
  }
) {
  return prisma.pelagicImportJob.update({
    where: { id: jobId },
    data: {
      status: PelagicJobStatus.SUCCESS,
      completedAt: new Date(),
      minioBucket: data.minioBucket,
      minioObjectKey: data.minioObjectKey,
      fileName: data.fileName,
      fileSize: data.fileSize,
      checksumSha256: data.checksumSha256,
      httpStatus: data.httpStatus,
      rowCount: data.rowCount,
      errorMessage: data.errorMessage,
    },
  });
}

export async function markJobFailed(jobId: string, errorMessage: string, httpStatus?: number) {
  return prisma.pelagicImportJob.update({
    where: { id: jobId },
    data: {
      status: PelagicJobStatus.FAILED,
      failedAt: new Date(),
      errorMessage,
      httpStatus,
    },
  });
}

export async function listJobs(params: {
  page: number;
  pageSize: number;
  status?: PelagicJobStatus;
  exportType?: PelagicExportType;
  imei?: string;
  createdBy?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const where: Prisma.PelagicImportJobWhereInput = {};
  if (params.status) where.status = params.status;
  if (params.exportType) where.exportType = params.exportType;
  if (params.createdBy) where.createdBy = params.createdBy;
  if (params.imei) where.imeis = { has: params.imei };
  if (params.dateFrom) where.dateFrom = { gte: params.dateFrom };
  if (params.dateTo) where.dateTo = { lte: params.dateTo };
  if (params.search) {
    where.OR = [
      { fileName: { contains: params.search, mode: 'insensitive' } },
      { minioObjectKey: { contains: params.search, mode: 'insensitive' } },
      { jobUuid: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.pelagicImportJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.pelagicImportJob.count({ where }),
  ]);

  return { items, total };
}

export async function getJobById(id: string) {
  return prisma.pelagicImportJob.findFirst({
    where: { OR: [{ id }, { jobUuid: id }] },
  });
}

export async function markJobCancelled(id: string) {
  return prisma.pelagicImportJob.update({
    where: { id },
    data: { status: PelagicJobStatus.CANCELLED },
  });
}

/** Jobs RUNNING orbites (redémarrage API, crash) — les marque en échec. */
export async function failStaleRunningJobs(maxAgeMinutes = 10) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const stale = await prisma.pelagicImportJob.findMany({
    where: {
      status: PelagicJobStatus.RUNNING,
      OR: [
        { startedAt: { lt: cutoff } },
        { startedAt: null, createdAt: { lt: cutoff } },
      ],
    },
    select: { id: true },
  });
  if (!stale.length) return 0;

  await prisma.pelagicImportJob.updateMany({
    where: { id: { in: stale.map((j) => j.id) } },
    data: {
      status: PelagicJobStatus.FAILED,
      failedAt: new Date(),
      errorMessage: 'Import interrompu (timeout ou redémarrage du service)',
    },
  });
  return stale.length;
}

export async function countActiveRunningJobs(maxAgeMinutes = 10) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  return prisma.pelagicImportJob.count({
    where: {
      status: PelagicJobStatus.RUNNING,
      startedAt: { gte: cutoff },
    },
  });
}
