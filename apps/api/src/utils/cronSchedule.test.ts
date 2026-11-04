import { describe, expect, it } from 'vitest';
import { cronToTime, describeSchedule, getNextDailyRun, resolveSchedule, timeToCron } from './cronSchedule';

describe('cronSchedule', () => {
  function localTime(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const part = (type: string) => parts.find(p => p.type === type)!.value;
    return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
  }

  it('affiche le 5 novembre après-midi le 4, sans sauter une journée', () => {
    expect(localTime(getNextDailyRun('01:00', 'Africa/Casablanca', new Date('2026-11-04T14:00:00Z')),
      'Africa/Casablanca')).toBe('2026-11-05 01:00');
  });

  it('garde la prochaine exécution du jour si l’heure n’est pas encore passée', () => {
    expect(getNextDailyRun('01:00', 'UTC', new Date('2026-11-04T00:15:00Z')).toISOString()).toBe('2026-11-04T01:00:00.000Z');
  });

  it('passe au lendemain à l’heure exacte du déclenchement', () => {
    expect(getNextDailyRun('01:00', 'UTC', new Date('2026-11-04T01:00:00Z')).toISOString()).toBe('2026-11-05T01:00:00.000Z');
  });

  it.each([
    ['2026-11-30T14:00:00Z', '2026-12-01 00:00'],
    ['2026-12-31T14:00:00Z', '2027-01-01 00:00'],
    ['2026-03-28T14:00:00Z', '2026-03-29 04:00'],
    ['2026-10-24T14:00:00Z', '2026-10-25 04:00'],
  ])('respecte le calendrier et le fuseau à partir de %s', (from, expected) => {
    const time = expected.slice(11);
    expect(localTime(getNextDailyRun(time, 'Europe/Paris', new Date(from)), 'Europe/Paris')).toBe(expected);
  });

  it('convertit HH:mm en expression cron', () => {
    expect(timeToCron('01:00')).toBe('0 1 * * *');
    expect(timeToCron('23:45')).toBe('45 23 * * *');
  });

  it('reconvertit une expression cron simple', () => {
    expect(cronToTime('0 1 * * *')).toBe('01:00');
  });

  it('décrit la planification', () => {
    expect(describeSchedule('01:00', 'Africa/Casablanca', 1)).toContain('01:00');
  });

  it('réaligne cron et heure affichée', () => {
    expect(resolveSchedule({ syncTime: '01:00', syncCron: '0 2 * * *' })).toEqual({
      syncTime: '01:00',
      syncCron: '0 1 * * *',
    });
  });

  it('dérive l heure depuis le cron si besoin', () => {
    expect(resolveSchedule({ syncCron: '22 0 * * *' })).toEqual({
      syncTime: '00:22',
      syncCron: '22 0 * * *',
    });
  });
});
