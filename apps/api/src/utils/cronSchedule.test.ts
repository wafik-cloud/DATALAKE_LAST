import { describe, expect, it } from 'vitest';
import { cronToTime, describeSchedule, getNextDailyRun, timeToCron } from './cronSchedule';

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

  it('calcule la prochaine exécution quotidienne', () => {
    const next = getNextDailyRun('00:22', 'Africa/Casablanca', new Date('2026-07-24T00:30:00Z'));
    expect(next.getTime()).toBeGreaterThan(Date.now() - 86400000);
  });
});
