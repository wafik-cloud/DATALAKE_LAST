import { describe, expect, it, vi } from 'vitest';
import { PelagicImportOrchestrator } from './pelagicImportOrchestrator';

describe('PelagicImportOrchestrator.runSync', () => {
  it('respecte intervalDays pour les exports points manuels', async () => {
    const orchestrator = new PelagicImportOrchestrator();
    const runExport = vi.spyOn(orchestrator, 'runExport').mockResolvedValue({
      skipped: false,
      job: { id: 'job-1' },
      manifestKey: 'manifest.json',
    } as any);

    await orchestrator.runSync({
      exportTypes: ['points'],
      dateFrom: '2025-09-01',
      dateTo: '2025-09-07',
      intervalDays: 7,
    });

    expect(runExport).toHaveBeenCalledTimes(1);
    expect(runExport).toHaveBeenCalledWith(expect.objectContaining({
      exportType: 'points',
      dateFrom: '2025-09-01',
      dateTo: '2025-09-07',
    }));
  });
});
