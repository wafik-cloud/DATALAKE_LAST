import { describe, expect, it } from 'vitest';
import { validateCsvResponse } from './csvValidation';

describe('validateCsvResponse', () => {
  it('accepte un CSV avec en-tête et lignes', () => {
    const buffer = Buffer.from('imei,lat,lng\n123,1,2\n');
    const result = validateCsvResponse(buffer, 'text/csv');
    expect(result.valid).toBe(true);
    expect(result.rowCount).toBe(1);
  });

  it('rejette une réponse HTML', () => {
    const buffer = Buffer.from('<!doctype html><html></html>');
    const result = validateCsvResponse(buffer);
    expect(result.valid).toBe(false);
  });

  it('accepte un CSV header-only avec message vide', () => {
    const buffer = Buffer.from('imei,lat,lng\n');
    const result = validateCsvResponse(buffer, 'text/csv');
    expect(result.valid).toBe(true);
    expect(result.emptyData).toBe(true);
    expect(result.message).toContain('Aucune donnée');
  });
});
