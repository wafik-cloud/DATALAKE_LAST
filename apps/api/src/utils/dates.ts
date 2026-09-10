const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export function isValidPelagicDateValue(value: string): boolean {
  if (!DATE_RE.test(value) && !DATE_TIME_RE.test(value)) return false;
  const isoValue = DATE_RE.test(value) ? `${value}T00:00:00Z` : `${value.replace(' ', 'T')}Z`;
  const date = new Date(isoValue);
  return !Number.isNaN(date.getTime());
}

export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

function addUtcDaysToDateString(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function toPelagicExclusiveDateTimeRange(
  dateFrom: string,
  dateTo: string
): { dateFrom: string; dateTo: string } {
  if (!isValidDateString(dateFrom) || !isValidDateString(dateTo)) {
    return { dateFrom, dateTo };
  }

  return {
    dateFrom: `${dateFrom} 00:00:00`,
    dateTo: `${addUtcDaysToDateString(dateTo, 1)} 00:00:00`,
  };
}

export function assertValidDateRange(dateFrom: string, dateTo: string): void {
  if (!isValidPelagicDateValue(dateFrom) || !isValidPelagicDateValue(dateTo)) {
    throw new Error('Les dates doivent être au format YYYY-MM-dd ou YYYY-MM-dd HH:mm:ss');
  }
  if (dateFrom > dateTo) {
    throw new Error('dateFrom doit être antérieure ou égale à dateTo');
  }
}

export function splitDateRange(
  dateFrom: string,
  dateTo: string,
  intervalDays: number
): Array<{ from: string; to: string }> {
  assertValidDateRange(dateFrom, dateTo);
  if (!isValidDateString(dateFrom) || !isValidDateString(dateTo)) {
    return [{ from: dateFrom, to: dateTo }];
  }

  const ranges: Array<{ from: string; to: string }> = [];
  let cursor = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);

  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + intervalDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    ranges.push({
      from: cursor.toISOString().slice(0, 10),
      to: chunkEnd.toISOString().slice(0, 10),
    });

    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return ranges;
}

export function formatObjectTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export function getYesterdayInTimezone(timeZone: string): string {
  const now = new Date();
  const todayInTz = formatDateInTimezone(now, timeZone);
  const yesterday = new Date(`${todayInTz}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return formatDateInTimezone(yesterday, timeZone);
}

export function formatPelagicTimestampInTimezone(date: Date, timeZone: string): string {
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

  const read = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return `${read('year')}-${read('month')}-${read('day')} ${read('hour')}:${read('minute')}:${read('second')}`;
}

export function getLast24HoursRangeInTimezone(
  timeZone: string,
  end = new Date()
): { dateFrom: string; dateTo: string } {
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return {
    dateFrom: formatPelagicTimestampInTimezone(start, timeZone),
    dateTo: formatPelagicTimestampInTimezone(end, timeZone),
  };
}

export function formatDateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
