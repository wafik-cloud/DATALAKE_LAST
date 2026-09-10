import { describe, expect, it } from 'vitest';
import { cronToTime, describeSchedule, getNextDailyRun, resolveSchedule, timeToCron } from './cronSchedule';

describe('cronSchedule', () => {
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
