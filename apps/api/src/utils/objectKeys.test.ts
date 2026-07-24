import { describe, expect, it } from 'vitest';
import { buildCsvObjectKey, buildManifestObjectKey } from './objectKeys';

describe('objectKeys', () => {
  const downloadedAt = new Date('2026-07-23T23:00:00Z');

  it('range les CSV par la période importée (dateFrom), pas la date de téléchargement', () => {
    const key = buildCsvObjectKey('trips', '2026-01-01', '2026-01-07', downloadedAt);
    expect(key).toMatch(/^trips\/2026\/01\//);
    expect(key).toContain('trips_2026-01-01_2026-01-07_');
    expect(key).not.toMatch(/^trips\/2026\/07\//);
  });

  it('range les manifestes dans le même dossier mensuel que les données', () => {
    const key = buildManifestObjectKey('2026-01-01', downloadedAt);
    expect(key).toMatch(/^manifests\/2026\/01\//);
  });
});
