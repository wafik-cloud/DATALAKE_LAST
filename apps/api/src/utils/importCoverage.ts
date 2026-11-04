/** Pelagic uses local wall-clock dates: date-only ends are inclusive;
 * timestamp ends are exclusive. Never infer periods from filenames. */
export const DAY = 86_400_000;
export type CoverageRange = { dateFrom: string | null; dateTo: string | null; exportType: string };
export type Interval = [number, number];
export function importInterval(range: CoverageRange): Interval | null {
  const parse = (value: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(value)) return NaN;
    const stamp = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : `${value.replace(' ', 'T')}Z`);
    return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value.slice(0, 10) ? stamp : NaN;
  };
  const start = parse(range.dateFrom);
  const end = parse(range.dateTo) + (range.dateTo?.length === 10 ? DAY : 0);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] : null;
}
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const merged: Interval[] = [];
  for (const interval of [...intervals].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}
export function buildCoverage(ranges: CoverageRange[], types: readonly string[], time: string) {
  const byType = new Map(types.map(type => [type, mergeIntervals(ranges
    .filter(range => range.exportType === type)
    .map(importInterval).filter((range): range is Interval => range !== null))]));
  const [hour, minute] = time.split(':').map(Number);
  const offset = (hour * 60 + minute) * 60_000;
  const covers = (start: number) => types.length > 0 && types.every(type =>
    byType.get(type)?.some(([from, to]) => from <= start && to >= start + DAY));
  return (day: string) => {
    const start = Date.parse(`${day}T00:00:00Z`);
    // Both types must cover the SAME full calendar or scheduled window.
    return covers(start) || covers(start + offset);
  };
}
export function localCoverageClock(now: Date, timezone: string, time: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const beforeRun = `${part('hour')}:${part('minute')}` < time;
  const lastDueDay = new Date(Date.parse(`${today}T00:00:00Z`) - DAY * (beforeRun ? 2 : 1)).toISOString().slice(0, 10);
  return { today, lastDueDay };
}

/** Subtract stored intervals before submitting any download, even partial overlaps. */
export function planMissingImports(days: string[], ranges: CoverageRange[], types: readonly string[], time: string, intervalDays: number) {
  const [hour, minute] = time.split(':').map(Number);
  const offset = (hour * 60 + minute) * 60_000;
  const byType = new Map(types.map(type => [type, mergeIntervals(ranges.filter(r => r.exportType === type)
    .map(importInterval).filter((r): r is Interval => r !== null))]));
  const subtract = (window: Interval, stored: Interval[]) => {
    let cursor = window[0];
    const missing: Interval[] = [];
    for (const [from, to] of stored) {
      if (to <= cursor) continue;
      if (from >= window[1]) break;
      if (from > cursor) missing.push([cursor, Math.min(from, window[1])]);
      cursor = Math.max(cursor, to);
      if (cursor >= window[1]) break;
    }
    if (cursor < window[1]) missing.push([cursor, window[1]]);
    return missing;
  };
  const gaps = new Map(types.map(type => [type, [] as Interval[]]));
  for (const day of days) {
    const start = Date.parse(`${day}T00:00:00Z`);
    const options = [start, start + offset].map(from => types.map(type => ({ type,
      missing: subtract([from, from + DAY], byType.get(type) || []) })));
    const duration = (option: typeof options[number]) => option.reduce((sum, entry) => sum + entry.missing.reduce((n, [a, b]) => n + b - a, 0), 0);
    const chosen = duration(options[0]) <= duration(options[1]) ? options[0] : options[1];
    for (const { type, missing } of chosen) gaps.get(type)!.push(...missing);
  }
  const format = (stamp: number) => new Date(stamp).toISOString().slice(0, 19).replace('T', ' ');
  return types.flatMap(exportType => mergeIntervals(gaps.get(exportType)!).flatMap(([from, to]) => {
    const chunks: Array<{ exportType: string; dateFrom: string; dateTo: string }> = [];
    for (let cursor = from; cursor < to; cursor += intervalDays * DAY) {
      chunks.push({ exportType, dateFrom: format(cursor), dateTo: format(Math.min(to, cursor + intervalDays * DAY)) });
    }
    return chunks;
  }));
}
