import { describe, expect, it } from 'vitest';
import { buildCoverage, importInterval, localCoverageClock } from './importCoverage';
const types = ['trips', 'points'];
const ranges = (dateFrom: string, dateTo: string) => types.map(exportType => ({ exportType, dateFrom, dateTo }));
describe('import coverage windows', () => {
  it('keeps legacy date-only ranges inclusive', () => {
    const covered = buildCoverage(ranges('2026-05-01', '2026-05-07'), types, '01:00');
    expect(covered('2026-05-07')).toBe(true);
    expect(covered('2026-05-08')).toBe(false);
  });
  it('recognizes cron windows without adding their exclusive end day', () => {
    const covered = buildCoverage(ranges('2026-11-02 01:00:00', '2026-11-03 01:00:00'), types, '01:00');
    expect(covered('2026-11-02')).toBe(true);
    expect(covered('2026-11-03')).toBe(false);
  });
  it('requires both types and a full common window', () => {
    expect(buildCoverage(ranges('2026-11-02', '2026-11-02').slice(0, 1), types, '01:00')('2026-11-02')).toBe(false);
    const mixed = [ranges('2026-11-02', '2026-11-02')[0], ranges('2026-11-02 01:00:00', '2026-11-03 01:00:00')[1]];
    expect(buildCoverage(mixed, types, '01:00')('2026-11-02')).toBe(false);
  });
  it('merges adjacent periods but preserves real gaps', () => {
    const pieces = [...ranges('2026-11-02 00:00:00', '2026-11-02 12:00:00'), ...ranges('2026-11-02 12:00:00', '2026-11-03 00:00:00')];
    expect(buildCoverage(pieces, types, '01:00')('2026-11-02')).toBe(true);
    pieces[2].dateFrom = '2026-11-02 12:01:00';
    expect(buildCoverage(pieces, types, '01:00')('2026-11-02')).toBe(false);
  });
  it('rejects missing, invalid and reversed metadata', () => {
    for (const [dateFrom, dateTo] of [[null, null], ['invalid', '2026-11-03'], ['2026-11-03', '2026-11-01']]) {
      expect(importInterval({ exportType: 'points', dateFrom, dateTo })).toBeNull();
    }
  });
  it('excludes the current window and waits for the local scheduled time', () => {
    expect(localCoverageClock(new Date('2026-11-04T14:00:00Z'), 'UTC', '01:00').lastDueDay).toBe('2026-11-03');
    expect(localCoverageClock(new Date('2026-11-04T00:30:00Z'), 'UTC', '01:00').lastDueDay).toBe('2026-11-02');
    expect(localCoverageClock(new Date('2026-11-04T01:00:00Z'), 'UTC', '01:00').lastDueDay).toBe('2026-11-03');
  });
  it('uses local dates across month and year boundaries', () => {
    expect(localCoverageClock(new Date('2027-01-01T00:30:00Z'), 'America/New_York', '01:00'))
      .toEqual({ today: '2026-12-31', lastDueDay: '2026-12-30' });
  });
});
