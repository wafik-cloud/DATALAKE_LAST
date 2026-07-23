import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Variable d'environnement manquante: ${name}`);
  }
  return value;
}

function parseMinioEndpoint(endpoint: string): { host: string; port: number; useSSL: boolean } {
  const url = new URL(endpoint);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
    useSSL: url.protocol === 'https:',
  };
}

const minioEndpoint = parseMinioEndpoint(
  process.env.MINIO_ENDPOINT || 'http://minio:9000'
);

const accessKey =
  process.env.MINIO_ACCESS_KEY && process.env.MINIO_ACCESS_KEY !== 'CHANGE_ME'
    ? process.env.MINIO_ACCESS_KEY
    : process.env.MINIO_ROOT_USER || 'minioadmin';

const secretKey =
  process.env.MINIO_SECRET_KEY && process.env.MINIO_SECRET_KEY !== 'CHANGE_ME'
    ? process.env.MINIO_SECRET_KEY
    : process.env.MINIO_ROOT_PASSWORD || 'minioadmin';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.API_PORT || 5001),
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
};
