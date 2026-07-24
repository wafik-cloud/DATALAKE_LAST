import dotenv from 'dotenv';
import path from 'path';
import type { PelagicExportType } from '../types/pelagic';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

function parseMinioEndpoint(endpoint: string): { host: string; port: number; useSSL: boolean } {
  const url = new URL(endpoint);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
    useSSL: url.protocol === 'https:',
  };
}

function parseExportTypes(value?: string): PelagicExportType[] {
  const allowed: PelagicExportType[] = ['trips', 'points'];
  const parsed = parseList(value).filter((item): item is PelagicExportType =>
    allowed.includes(item as PelagicExportType)
  );
  return parsed.length ? parsed : ['trips', 'points'];
}

function parseList(value?: string): string[] {
  if (!value?.trim()) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

const minioEndpoint = parseMinioEndpoint(process.env.MINIO_ENDPOINT || 'http://minio:9000');

const rootUser = process.env.MINIO_ROOT_USER || 'minioadmin';
const rootPassword = process.env.MINIO_ROOT_PASSWORD || 'minioadmin';

const accessKey =
  process.env.MINIO_ACCESS_KEY && process.env.MINIO_ACCESS_KEY !== 'CHANGE_ME'
    ? process.env.MINIO_ACCESS_KEY
    : rootUser;

const usingRootAccessKey = accessKey === rootUser;

const secretKey = usingRootAccessKey
  ? rootPassword
  : process.env.MINIO_SECRET_KEY && process.env.MINIO_SECRET_KEY !== 'CHANGE_ME'
    ? process.env.MINIO_SECRET_KEY
    : rootPassword;

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.API_PORT || 5001),
  databaseUrl: process.env.DATABASE_URL || '',
  adminApiKey: process.env.ADMIN_API_KEY || process.env.JWT_SECRET || 'dev-admin-key-change-me',
  minio: {
    ...minioEndpoint,
    accessKey,
    secretKey,
    bucket: process.env.MINIO_BUCKET || 'pelagic-data',
    region: process.env.MINIO_REGION || 'us-east-1',
    publicEndpoint: process.env.MINIO_PUBLIC_ENDPOINT || 'http://localhost:9000',
    consoleUrl: process.env.MINIO_CONSOLE_URL || 'http://localhost:9001',
    useSSL: process.env.MINIO_USE_SSL === 'true' || minioEndpoint.useSSL,
  },
  pelagic: {
    baseUrl: (process.env.PELAGIC_API_BASE_URL || 'https://analytics.pelagicdata.com/api').replace(/\/$/, ''),
    token: process.env.PELAGIC_API_TOKEN || '',
    secret: process.env.PELAGIC_API_SECRET || '',
    syncEnabled: process.env.PELAGIC_SYNC_ENABLED !== 'false',
    syncCron: process.env.PELAGIC_SYNC_CRON || '0 2 * * *',
    syncTimezone: process.env.PELAGIC_SYNC_TIMEZONE || 'Africa/Casablanca',
    defaultImeis: parseList(process.env.PELAGIC_SYNC_DEFAULT_IMEIS),
    defaultTags: parseList(process.env.PELAGIC_SYNC_TAGS),
    deviceInfo: process.env.PELAGIC_SYNC_DEVICE_INFO !== 'false',
    withLastSeen: process.env.PELAGIC_SYNC_WITH_LAST_SEEN !== 'false',
    includeErrant: process.env.PELAGIC_SYNC_INCLUDE_ERRANT === 'true',
    httpTimeoutMs: Number(process.env.PELAGIC_HTTP_TIMEOUT_MS || 120000),
    maxRetries: Number(process.env.PELAGIC_HTTP_MAX_RETRIES || 3),
    syncExportTypes: parseExportTypes(process.env.PELAGIC_SYNC_EXPORT_TYPES),
  },
};

export function pelagicConfigured(): boolean {
  return Boolean(
    env.pelagic.token &&
      env.pelagic.secret &&
      env.pelagic.token !== 'CHANGE_ME' &&
      env.pelagic.secret !== 'CHANGE_ME'
  );
}
