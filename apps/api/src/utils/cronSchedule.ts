const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function timeToCron(time: string): string {
  const match = TIME_RE.exec(time.trim());
  if (!match) {
    throw new Error('L\'heure doit être au format HH:mm (ex. 01:00)');
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return `${minute} ${hour} * * *`;
}

export function cronToTime(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 2) return '01:00';
  const minute = Number(parts[0]);
  const hour = Number(parts[1]);
  if (Number.isNaN(minute) || Number.isNaN(hour)) return '01:00';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function describeSchedule(time: string, timezone: string, intervalDays: number): string {
  const intervalLabel = intervalDays === 1 ? 'la veille' : `par tranches de ${intervalDays} jours`;
  return `Chaque nuit à ${time} (${timezone}) — import automatique de ${intervalLabel}`;
}

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let attempt = 0; attempt < 6; attempt++) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const desiredMinutes = hour * 60 + minute;
    const actualMinutes = parts.hour * 60 + parts.minute;
    const dayOffset = day - parts.day;
    const deltaMinutes = dayOffset * 24 * 60 + (desiredMinutes - actualMinutes);
    if (deltaMinutes === 0) break;
    guess += deltaMinutes * 60 * 1000;
  }

  return new Date(guess);
}

export function getNextDailyRun(time: string, timezone: string, from = new Date()): Date {
  const [hour, minute] = time.split(':').map(Number);
  const today = getZonedParts(from, timezone);
  let candidate = zonedTimeToUtc(today.year, today.month, today.day, hour, minute, timezone);

  if (candidate <= from) {
    const tomorrowBase = new Date(from.getTime() + 36 * 60 * 60 * 1000);
    const tomorrow = getZonedParts(tomorrowBase, timezone);
    candidate = zonedTimeToUtc(tomorrow.year, tomorrow.month, tomorrow.day, hour, minute, timezone);
  }

  return candidate;
}
