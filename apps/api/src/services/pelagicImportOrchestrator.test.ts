import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'stream';

const mocks = vi.hoisted(() => ({
  findSuccessfulDuplicates: vi.fn(), createJob: vi.fn(), markJobRunning: vi.fn(),
  markJobSuccess: vi.fn(), markJobFailed: vi.fn(), objectExists: vi.fn(),
  downloadObject: vi.fn(), uploadObject: vi.fn(), exportTrips: vi.fn(),
}));
vi.mock('../repositories/pelagicImportJobRepository', () => mocks);
vi.mock('./minioStorageService', () => ({ minioStorageService: mocks }));
vi.mock('./pelagicDataService', () => ({ pelagicDataService: mocks }));
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

describe('PelagicImportOrchestrator.runExport — immatriculation', () => {
  const input = { exportType: 'trips' as const, dateFrom: '2026-09-25', dateTo: '2026-10-02', deviceInfo: false };
  const enrichedHeader = 'Trip,Device Id,registrationNumber,registrationAuthority,registrationExpiration,flag,ownerName';

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.objectExists.mockResolvedValue(true);
    mocks.createJob.mockResolvedValue({ id: 'job-new', jobUuid: 'uuid-new' });
    mocks.markJobSuccess.mockResolvedValue({ id: 'job-new', status: 'SUCCESS' });
    mocks.exportTrips.mockResolvedValue({
      createReadStream: () => Readable.from(['csv']), cleanup: vi.fn().mockResolvedValue(undefined),
      fileSize: 3, checksumSha256: 'checksum', rowCount: 2, unmatchedBoatCount: 1,
      httpStatus: 200, emptyData: false,
    });
  });

  it('réimporte un ancien CSV sans immatriculation et décrit les filtres effectifs', async () => {
    mocks.findSuccessfulDuplicates.mockResolvedValue([{ id: 'old', minioObjectKey: 'old.csv' }]);
    mocks.downloadObject.mockImplementation(async () => Readable.from(['Trip,Device Id\nT1,dev\n']));
    const result = await new PelagicImportOrchestrator().runExport(input);
    expect(result.skipped).toBe(false);
    expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({ deviceInfo: true }));
    expect(mocks.exportTrips).toHaveBeenCalledWith(expect.objectContaining({ deviceInfo: true }));
    const manifestCall = mocks.uploadObject.mock.calls.find(([object]) => object.contentType === 'application/json');
    expect(JSON.parse(manifestCall![0].body.toString())).toMatchObject({ deviceInfo: true, unmatchedBoatCount: 1 });
  });

  it('conserve un import déjà enrichi sans télécharger à nouveau Pelagic', async () => {
    mocks.findSuccessfulDuplicates.mockResolvedValue([{ id: 'existing', minioObjectKey: 'joined.csv' }]);
    mocks.downloadObject.mockImplementation(async () => Readable.from([enrichedHeader + '\n']));
    const result = await new PelagicImportOrchestrator().runExport(input);
    expect(result.skipped).toBe(true);
    expect(mocks.exportTrips).not.toHaveBeenCalled();
    expect(mocks.createJob).not.toHaveBeenCalled();
  });
});
