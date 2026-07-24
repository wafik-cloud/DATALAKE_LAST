import { prisma } from '../lib/prisma';

const ALLOWED_INTERVALS = [1, 7, 15, 30] as const;

export function isValidIntervalDays(value: number): boolean {
  return ALLOWED_INTERVALS.includes(value as (typeof ALLOWED_INTERVALS)[number]);
}

export async function listMonthPlans() {
  return prisma.pelagicMonthPlan.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
}

export async function getMonthPlanMap() {
  const plans = await listMonthPlans();
  const map = new Map<string, number>();
  for (const plan of plans) {
    map.set(`${plan.year}-${String(plan.month).padStart(2, '0')}`, plan.intervalDays);
  }
  return map;
}

export async function upsertMonthPlan(
  year: number,
  month: number,
  intervalDays: number,
  updatedBy?: string
) {
  if (!isValidIntervalDays(intervalDays)) {
    throw new Error('intervalDays doit être 1, 7, 15 ou 30');
  }

  return prisma.pelagicMonthPlan.upsert({
    where: { year_month: { year, month } },
    create: { year, month, intervalDays, updatedBy },
    update: { intervalDays, updatedBy },
  });
}

export async function getMonthPlanInterval(year: number, month: number): Promise<number | null> {
  const plan = await prisma.pelagicMonthPlan.findUnique({
    where: { year_month: { year, month } },
  });
  return plan?.intervalDays ?? null;
}
