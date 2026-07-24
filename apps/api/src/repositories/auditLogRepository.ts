import { prisma } from '../lib/prisma';

export async function writeAuditLog(action: string, actor?: string, details?: string) {
  return prisma.adminAuditLog.create({
    data: { action, actor, details },
  });
}

export async function listRecentAuditLogs(limit = 20) {
  return prisma.adminAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
