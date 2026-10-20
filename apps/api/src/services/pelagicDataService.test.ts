import { describe, expect, it, vi, beforeEach } from 'vitest';
import { access, readFile } from 'fs/promises';
import { Readable } from 'stream';
import { createHash } from 'crypto';

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

  it('encode les horodatages points dans le chemin', () => {
    const url = service.buildUrl('points', {
      dateFrom: '2026-08-13 02:30:00',
      dateTo: '2026-08-14 02:30:00',
    });

    expect(url).toContain('/v1/points/2026-08-13%2002%3A30%3A00/2026-08-14%2002%3A30%3A00');
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

  it('compte toutes les lignes d’un CSV reçu en plusieurs blocs puis nettoie le temporaire', async () => {
    axiosGet.mockResolvedValue({
      status: 200,
      data: Readable.from([
        Buffer.from('imei,lat,lng\n111,1'),
        Buffer.from(',2\n222,3,4\n333,5,6'),
      ]),
      headers: { 'content-type': 'text/csv' },
    });

    const result = await service.fetchExport('points', {
      dateFrom: '2026-07-02',
      dateTo: '2026-07-03',
    });

    expect(result.rowCount).toBe(3);
    expect(result.fileSize).toBeGreaterThan(0);
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(access(result.filePath)).resolves.toBeUndefined();
    await result.cleanup();
    await expect(access(result.filePath)).rejects.toThrow();
  });
});

describe('PelagicDataService.exportTrips', () => {
  const service = new PelagicDataService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('joint boats/info sur Device Id et ajoute les colonnes d’immatriculation', async () => {
    axiosGet
      .mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify([
          {
            deviceId: 'dev-1',
            registrationNumber: 'MA-1',
            registrationAuthority: 'DPM',
            registrationExpiration: Date.parse('2027-01-15T00:00:00Z'),
            flag: 'MAR',
            ownerName: 'Armateur',
          },
        ]),
        headers: { 'content-type': 'application/json' },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: Readable.from([Buffer.from('Trip,Boat Name,Device Id\nT1,Bateau A,dev-1\nT2,Bateau B,absent\n')]),
        headers: { 'content-type': 'text/csv' },
      });

    const result = await service.exportTrips({
      dateFrom: '2026-10-14',
      dateTo: '2026-10-15',
      deviceInfo: false,
    });

    const boatsUrl = String(axiosGet.mock.calls[0][0]);
    const tripsUrl = String(axiosGet.mock.calls[1][0]);
    expect(boatsUrl).toContain('/v1/boats/info');
    expect(boatsUrl).not.toContain('test-secret');
    expect(tripsUrl).toContain('/v1/trips/2026-10-14/2026-10-15');
    expect(tripsUrl).toContain('deviceInfo=true');
    expect(axiosGet.mock.calls[0][1].headers['X-API-SECRET']).toBe('test-secret');

    const csv = await readFile(result.filePath, 'utf8');
    expect(csv.split('\n')[0]).toBe(
      'Trip,Boat Name,Device Id,registrationNumber,registrationAuthority,registrationExpiration,flag,ownerName'
    );
    expect(csv).toContain('T1,Bateau A,dev-1,MA-1,DPM,2027-01-15,MAR,Armateur');
    expect(csv).toContain('T2,Bateau B,absent,,,,,');
    expect(result.unmatchedBoatCount).toBe(1);
    expect(result.rowCount).toBe(2);
    expect(result.fileSize).toBe(Buffer.byteLength(csv));
    expect(result.checksumSha256).toBe(createHash('sha256').update(csv).digest('hex'));
    await result.cleanup();
  });

  it('impose Device Id même via fetchExport avec deviceInfo désactivé', async () => {
    axiosGet.mockResolvedValueOnce({ status: 200, data: '[]', headers: {} })
      .mockResolvedValueOnce({
        status: 200, data: Buffer.from('Trip,Device Id\n'),
        headers: { 'content-type': 'text/csv' },
      });
    const result = await service.fetchExport('trips', {
      dateFrom: '2026-10-01', dateTo: '2026-10-02', deviceInfo: false,
    });
    try {
      expect(String(axiosGet.mock.calls[1][0])).toContain('deviceInfo=true');
      expect(result.rowCount).toBe(0);
      expect(result.emptyData).toBe(true);
      expect(result.headerLine).toContain('registrationNumber');
    } finally { await result.cleanup(); }
  });

  it('remonte un refus boats/info sans publier un export faussement enrichi', async () => {
    axiosGet.mockResolvedValueOnce({ status: 401, data: 'test-secret test-token', headers: {} });
    await expect(service.exportTrips({ dateFrom: '2026-10-01', dateTo: '2026-10-02' }))
      .rejects.toThrow(/HTTP 401 boats\/info/);
    expect(axiosGet).toHaveBeenCalledTimes(1);
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
