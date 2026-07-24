const locks = new Set<string>();

export function buildJobLockKey(parts: {
  exportType: string;
  dateFrom: string;
  dateTo: string;
  imeis: string[];
  tags: string[];
}): string {
  return [parts.exportType, parts.dateFrom, parts.dateTo, parts.imeis.join('|'), parts.tags.join('|')].join(':');
}

export function acquireJobLock(key: string): boolean {
  if (locks.has(key)) return false;
  locks.add(key);
  return true;
}

export function releaseJobLock(key: string): void {
  locks.delete(key);
}
