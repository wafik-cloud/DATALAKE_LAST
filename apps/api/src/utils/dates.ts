const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

export function assertValidDateRange(dateFrom: string, dateTo: string): void {
  if (!isValidDateString(dateFrom) || !isValidDateString(dateTo)) {
    throw new Error('Les dates doivent être au format YYYY-MM-dd');
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

export function formatDateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
