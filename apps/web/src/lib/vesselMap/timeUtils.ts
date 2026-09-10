export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\+00$/, 'Z');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function timeMs(value: string | null | undefined): number | null {
  const parsed = parseDate(value);
  return parsed ? parsed.getTime() : null;
}

export function formatDateTime(value: string | null | undefined): string {
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleString('fr-FR') : '-';
}
