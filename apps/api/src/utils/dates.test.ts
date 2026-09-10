import { describe, expect, it } from 'vitest';
import {
  assertValidDateRange,
  getLast24HoursRangeInTimezone,
  splitDateRange,
  toPelagicExclusiveDateTimeRange,
} from './dates';

describe('dates Pelagic', () => {
  it('calcule une fenêtre non nulle des dernières 24h dans le fuseau configuré', () => {
    const end = new Date('2026-08-14T10:15:30Z');
    const range = getLast24HoursRangeInTimezone('Africa/Casablanca', end);

    expect(range).toEqual({
      dateFrom: '2026-08-13 11:15:30',
      dateTo: '2026-08-14 11:15:30',
    });
  });

  it('accepte les horodatages et ne découpe pas une fenêtre horaire', () => {
    const dateFrom = '2026-08-13 11:15:30';
    const dateTo = '2026-08-14 11:15:30';

    expect(() => assertValidDateRange(dateFrom, dateTo)).not.toThrow();
    expect(splitDateRange(dateFrom, dateTo, 1)).toEqual([{ from: dateFrom, to: dateTo }]);
  });

  it('transforme une période journalière manuelle en fenêtre exclusive non nulle', () => {
    expect(toPelagicExclusiveDateTimeRange('2026-08-13', '2026-08-13')).toEqual({
      dateFrom: '2026-08-13 00:00:00',
      dateTo: '2026-08-14 00:00:00',
    });

    expect(toPelagicExclusiveDateTimeRange('2026-08-13', '2026-08-15')).toEqual({
      dateFrom: '2026-08-13 00:00:00',
      dateTo: '2026-08-16 00:00:00',
    });
  });

  it('conserve une période déjà horodatée', () => {
    expect(toPelagicExclusiveDateTimeRange('2026-08-13 02:00:00', '2026-08-14 02:00:00')).toEqual({
      dateFrom: '2026-08-13 02:00:00',
      dateTo: '2026-08-14 02:00:00',
    });
  });
});
