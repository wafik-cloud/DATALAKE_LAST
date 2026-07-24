export type PelagicExportType = 'trips' | 'points';

export interface PelagicExportOptions {
  dateFrom: string;
  dateTo: string;
  imeis?: string[];
  deviceInfo?: boolean;
  withLastSeen?: boolean;
  errant?: boolean;
  tags?: string[];
}

export interface PelagicSyncRequest {
  exportTypes?: PelagicExportType[];
  dateFrom: string;
  dateTo: string;
  imeis?: string[];
  tags?: string[];
  deviceInfo?: boolean;
  withLastSeen?: boolean;
  includeErrant?: boolean;
  force?: boolean;
  intervalDays?: 1 | 7 | 15 | 30;
}

export interface CsvValidationResult {
  valid: boolean;
  emptyData: boolean;
  rowCount: number;
  headerLine: string;
  message?: string;
}
