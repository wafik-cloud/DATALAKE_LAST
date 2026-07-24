import { describe, expect, it, vi, beforeEach } from 'vitest';

const axiosGet = vi.fn();

vi.mock('axios', () => ({
  default: {
    get: (...args: unknown[]) => axiosGet(...args),
  },
}));

vi.mock('../config/env', () => ({
  env: {
    pelagic: {
      baseUrl: 'https://analytics.pelagicdata.com/api',
      token: 'test-token',
      secret: 'test-secret',
      deviceInfo: true,
      withLastSeen: true,
      includeErrant: false,
      httpTimeoutMs: 1000,
      maxRetries: 1,
    },
  },
  pelagicConfigured: () => true,
}));

import { PelagicDataService } from './pelagicDataService';

describe('PelagicDataService.buildUrl', () => {
  const service = new PelagicDataService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('construit l’URL trips avec paramètres encodés', () => {
    const url = service.buildUrl('trips', {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-03',
      imeis: ['111', '222'],
      tags: ['fleet-a'],
      deviceInfo: true,
      withLastSeen: true,
    });

    expect(url).toContain('/v1/trips/2026-07-01/2026-07-03');
    expect(url).toContain('imeis=111%2C222');
    expect(url).toContain('tags=fleet-a');
    expect(url).not.toContain('test-secret');
  });

  it('ajoute errant pour points', () => {
    const url = service.buildUrl('points', {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      errant: true,
    });
    expect(url).toContain('errant=true');
  });
});

describe('PelagicDataService.fetchExport', () => {
  const service = new PelagicDataService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formate un HTTP 500 vide pour points avec un message explicite', async () => {
    axiosGet.mockResolvedValue({
      status: 500,
      data: new ArrayBuffer(0),
      headers: {},
    });

    await expect(
      service.fetchExport('points', { dateFrom: '2026-07-02', dateTo: '2026-07-02' })
    ).rejects.toThrow(/export points indisponible/);
  });
});

describe('PelagicDataService.testConnection', () => {
  const service = new PelagicDataService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signale une connexion partielle si trips OK et points KO', async () => {
    axiosGet
      .mockResolvedValueOnce({
        status: 200,
        data: Buffer.from('header'),
        headers: { 'content-type': 'text/csv' },
      })
      .mockResolvedValueOnce({
        status: 500,
        data: new ArrayBuffer(0),
        headers: {},
      });

    const result = await service.testConnection();

    expect(result.ok).toBe(false);
    expect(result.tests).toHaveLength(2);
    expect(result.tests[0]).toMatchObject({ exportType: 'trips', ok: true, httpStatus: 200 });
    expect(result.tests[1]).toMatchObject({ exportType: 'points', ok: false, httpStatus: 500 });
    expect(result.message).toContain('Connexion partielle');
  });

  it('signale une connexion complète si trips et points répondent 200', async () => {
    axiosGet.mockResolvedValue({
      status: 200,
      data: Buffer.from('header'),
      headers: { 'content-type': 'text/csv' },
    });

    const result = await service.testConnection();

    expect(result.ok).toBe(true);
    expect(result.tests.every((test) => test.ok)).toBe(true);
    expect(result.message).toContain('opérationnelle');
  });
});
