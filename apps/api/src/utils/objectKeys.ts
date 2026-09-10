import { PelagicExportType } from '../types/pelagic';
import { formatObjectTimestamp } from './dates';

function periodFolderFromDate(date: string): { year: string; month: string } {
  const [year, month] = date.split('-');
  if (!year || !month) {
    throw new Error(`Date invalide pour le chemin objet: ${date}`);
  }
  return { year, month };
}

function safePeriodPart(value: string): string {
  return value.replace(/[^0-9A-Za-z_-]+/g, '_');
}

export function buildCsvObjectKey(
  exportType: PelagicExportType,
  dateFrom: string,
  dateTo: string,
  downloadedAt: Date
): string {
  const { year, month } = periodFolderFromDate(dateFrom);
  const ts = formatObjectTimestamp(downloadedAt);
  const fileName = `${exportType}_${safePeriodPart(dateFrom)}_${safePeriodPart(dateTo)}_${ts}.csv`;
  return `${exportType}/${year}/${month}/${fileName}`;
}

export function buildManifestObjectKey(dateFrom: string, downloadedAt: Date): string {
  const { year, month } = periodFolderFromDate(dateFrom);
  const ts = formatObjectTimestamp(downloadedAt);
  return `manifests/${year}/${month}/manifest_${ts}.json`;
}

export function buildMapPreviewObjectKey(csvObjectKey: string): string {
  const safeKey = csvObjectKey.replace(/^\//, '').replace(/[^0-9A-Za-z_./-]+/g, '_');
  const previewKey = safeKey.replace(/\.csv$/i, '_map_preview.json');
  return `previews/maps/${previewKey}`;
}

export function buildErrorObjectKey(downloadedAt: Date): string {
  const year = downloadedAt.getUTCFullYear();
  const month = String(downloadedAt.getUTCMonth() + 1).padStart(2, '0');
  const ts = formatObjectTimestamp(downloadedAt);
  return `errors/${year}/${month}/error_${ts}.json`;
}

export function isAllowedObjectKey(key: string): boolean {
  return /^(trips|points|manifests|errors|previews)\//.test(key) && !key.includes('..');
}
