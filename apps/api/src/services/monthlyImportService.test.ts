import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ jobs: vi.fn(), explorer: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: { pelagicImportJob: { findMany: mocks.jobs } } }));
vi.mock('./storageExplorerService', () => ({ getStorageExplorer: mocks.explorer }));
vi.mock('../config/env', () => ({ env: { pelagic: { syncExportTypes: ['trips', 'points'] } } }));
vi.mock('../repositories/integrationSettingsRepository', () => ({ getIntegrationSettings: async () => ({ syncEnabled: true, syncTime: '01:00', syncTimezone: 'UTC', syncIntervalDays: 1, defaultImeis: [], defaultTags: [] }) }));
vi.mock('../repositories/monthPlanRepository', () => ({ getMonthPlanMap: async () => new Map() }));
import { getMonthlyImportOverview, getMissingMonthImports } from './monthlyImportService';
const files = (dateFrom = '2026-11-01 01:00:00', dateTo = '2026-11-04 01:00:00') => ['trips', 'points'].map(exportType => ({
  exportType, dateFrom, dateTo, status: 'SUCCESS', coverageEligible: true, importedAt: '2026-11-04T13:36:50Z', rowCount: 0,
}));
const november = async () => (await getMonthlyImportOverview(2026)).months.find(m => m.month === 11)!;
describe('monthly reconciliation', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-04T14:00:00Z')); mocks.jobs.mockResolvedValue([]); mocks.explorer.mockResolvedValue({ items: files(), unreadableMetadata: 0 }); });
  afterEach(() => vi.useRealTimers());
  it('counts stored manifests absent from DB and excludes the open day', async () => {
    expect(await november()).toMatchObject({ status: 'complete', importedDays: 3, totalDays: 3, pendingDays: 0, dateTo: '2026-11-03' });
  });
  it('does not count a DB success whose CSV is missing', async () => {
    mocks.jobs.mockResolvedValue([{ dateFrom: '2026-11-01', dateTo: '2026-11-03', status: 'SUCCESS', exportType: 'points', imeis: [], tags: [] }]);
    mocks.explorer.mockResolvedValue({ items: files().slice(0, 1), unreadableMetadata: 0 });
    expect(await november()).toMatchObject({ importedDays: 0, pendingDays: 3 });
  });
  it('preserves real gaps and excludes filtered or unknown imports', async () => {
    mocks.explorer.mockResolvedValue({ items: [...files('2026-11-01', '2026-11-01'), ...files('2026-11-02', '2026-11-02').map(f => ({ ...f, coverageEligible: false })), ...files('2026-11-03', '2026-11-03').map(f => ({ ...f, status: 'UNKNOWN' }))], unreadableMetadata: 0 });
    expect(await november()).toMatchObject({ status: 'partial', importedDays: 1, pendingDays: 2 });
  });
  it('ignores a historic failure replaced by successful files', async () => {
    mocks.jobs.mockResolvedValue([{ dateFrom: '2026-11-02 01:00:00', dateTo: '2026-11-03 01:00:00', status: 'FAILED', exportType: 'points', imeis: [], tags: [] }]);
    expect(await november()).toMatchObject({ status: 'complete', failedDays: 0 });
  });
  it('reports metadata read failures instead of false missing days', async () => {
    mocks.explorer.mockResolvedValue({ items: [], unreadableMetadata: 1 });
    await expect(november()).rejects.toThrow('métadonnées MinIO');
  });
});

it('plans only closed missing periods and never downloads complete months', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-04T14:00:00Z'));
  try {
    mocks.explorer.mockResolvedValue({ items: files(), unreadableMetadata: 0 });
    expect((await getMissingMonthImports(2026, 11, 1)).ranges).toEqual([]);
    mocks.explorer.mockResolvedValue({ items: [], unreadableMetadata: 0 });
    const plan = await getMissingMonthImports(2026, 11, 1);
    expect(plan.dateTo).toBe('2026-11-03');
    expect(plan.ranges).toHaveLength(6);
    expect(plan.ranges.every(r => r.dateTo <= '2026-11-04 00:00:00')).toBe(true);
  } finally { vi.useRealTimers(); }
});
