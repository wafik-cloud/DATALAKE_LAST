import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { env, pelagicConfigured } from '../config/env';
import { PelagicExportOptions, PelagicExportType } from '../types/pelagic';
import { validateCsvResponse } from '../utils/csvValidation';
import { redactSensitiveText } from '../utils/maskSecret';

export interface PelagicFetchResult {
  filePath: string;
  fileSize: number;
  checksumSha256: string;
  rowCount: number;
  headerLine: string;
  emptyData: boolean;
  httpStatus: number;
  contentType?: string;
  attemptCount: number;
  createReadStream(): Readable;
  cleanup(): Promise<void>;
}

export interface PelagicExportTestResult {
  exportType: PelagicExportType;
  ok: boolean;
  httpStatus?: number;
  message: string;
}

export interface PelagicConnectionTestResult {
  ok: boolean;
  message: string;
  tests: PelagicExportTestResult[];
}

function formatPelagicHttpError(
  status: number,
  bodyPreview: string,
  exportType: PelagicExportType,
  redact: (text: string) => string
): string {
  const safeMessage = redact(bodyPreview).trim();

  if (status === 500 && !safeMessage) {
    if (exportType === 'points') {
      return 'HTTP 500: export points indisponible (réponse vide) — vérifiez l\'abonnement Pelagic ou contactez le support';
    }
    return 'HTTP 500: réponse vide de l\'API Pelagic';
  }

  return safeMessage ? `HTTP ${status}: ${safeMessage}` : `HTTP ${status}`;
}

function asReadable(value: Readable | Buffer | ArrayBuffer): Readable {
  if (value instanceof Readable) return value;
  return Readable.from([Buffer.isBuffer(value) ? value : Buffer.from(value)]);
}

async function readErrorPreview(stream: Readable, limit = 4096): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const remaining = limit - size;
    if (remaining > 0) {
      chunks.push(chunk.subarray(0, remaining));
      size += Math.min(chunk.length, remaining);
    }
    if (size >= limit) {
      stream.destroy();
      break;
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function persistCsvStream(stream: Readable, contentType?: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pds-pelagic-'));
  const filePath = path.join(directory, 'export.csv');
  const hash = crypto.createHash('sha256');
  let fileSize = 0;
  let pending = '';
  let headerLine = '';
  let nonEmptyLines = 0;
  let sample = Buffer.alloc(0);

  const inspector = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      fileSize += data.length;
      hash.update(data);
      if (sample.length < 4096) {
        sample = Buffer.concat([sample, data.subarray(0, 4096 - sample.length)]);
      }

      const text = pending + data.toString('utf8');
      const lines = text.split(/\r?\n/);
      pending = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        nonEmptyLines += 1;
        if (!headerLine) headerLine = line.replace(/^\uFEFF/, '').trim();
      }
      callback(null, data);
    },
    flush(callback) {
      if (pending.trim()) {
        nonEmptyLines += 1;
        if (!headerLine) headerLine = pending.replace(/^\uFEFF/, '').trim();
      }
      callback();
    },
  });

  try {
    await pipeline(stream, inspector, createWriteStream(filePath, { flags: 'wx' }));
    const validation = validateCsvResponse(sample, contentType, Math.max(0, nonEmptyLines - 1));
    if (!validation.valid) throw new Error(validation.message || 'CSV invalide');
    return {
      filePath,
      fileSize,
      checksumSha256: hash.digest('hex'),
      rowCount: validation.rowCount,
      headerLine: headerLine || validation.headerLine,
      emptyData: validation.emptyData,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export class PelagicDataService {
  buildUrl(exportType: PelagicExportType, options: PelagicExportOptions): string {
    const { dateFrom, dateTo, imeis, deviceInfo, withLastSeen, errant, tags } = options;
    const base = `${env.pelagic.baseUrl}/${encodeURIComponent(env.pelagic.token)}/v1/${exportType}/${encodeURIComponent(dateFrom)}/${encodeURIComponent(dateTo)}`;
    const params = new URLSearchParams();

    if (imeis?.length) params.set('imeis', imeis.join(','));
    if (deviceInfo ?? env.pelagic.deviceInfo) params.set('deviceInfo', 'true');
    if (withLastSeen ?? env.pelagic.withLastSeen) params.set('withLastSeen', 'true');
    if (exportType === 'points' && (errant ?? env.pelagic.includeErrant)) params.set('errant', 'true');
    if (tags?.length) params.set('tags', tags.join(','));

    const query = params.toString();
    return query ? `${base}?${query}` : base;
  }

  private shouldRetry(error: unknown): boolean {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      if (status === 401 || status === 403 || status === 400 || status === 404) return false;
      return true;
    }
    return true;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async exportTrips(options: PelagicExportOptions): Promise<PelagicFetchResult> {
    return this.fetchExport('trips', options);
  }

  async exportPoints(options: PelagicExportOptions): Promise<PelagicFetchResult> {
    return this.fetchExport('points', { ...options, errant: options.errant ?? env.pelagic.includeErrant });
  }

  async fetchExport(exportType: PelagicExportType, options: PelagicExportOptions): Promise<PelagicFetchResult> {
    if (!pelagicConfigured()) {
      throw new Error('Configuration Pelagic incomplète (token/secret)');
    }

    const url = this.buildUrl(exportType, options);
    let lastError: unknown;

    for (let attempt = 1; attempt <= env.pelagic.maxRetries; attempt++) {
      try {
        const response = await axios.get<Readable>(url, {
          headers: {
            'X-API-SECRET': env.pelagic.secret,
            Accept: 'text/csv',
          },
          responseType: 'stream',
          timeout: env.pelagic.httpTimeoutMs,
          validateStatus: () => true,
        });

        if (response.status >= 400) {
          const bodyPreview = (await readErrorPreview(asReadable(response.data as Readable | Buffer | ArrayBuffer))).slice(0, 200);
          const redact = (text: string) => redactSensitiveText(text, [env.pelagic.token, env.pelagic.secret]);
          const err = new Error(formatPelagicHttpError(response.status, bodyPreview, exportType, redact));
          (err as Error & { status?: number }).status = response.status;
          throw err;
        }

        const contentType = response.headers['content-type'] != null
          ? String(response.headers['content-type'])
          : undefined;
        const persisted = await persistCsvStream(asReadable(response.data as Readable | Buffer | ArrayBuffer), contentType);

        return {
          ...persisted,
          httpStatus: response.status,
          contentType,
          attemptCount: attempt,
          createReadStream: () => createReadStream(persisted.filePath),
        };
      } catch (error) {
        lastError = error;
        if (attempt >= env.pelagic.maxRetries || !this.shouldRetry(error)) break;
        await this.delay(attempt * 2000);
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'Erreur Pelagic inconnue';
    const err = new Error(redactSensitiveText(message, [env.pelagic.token, env.pelagic.secret]));
    (err as Error & { status?: number }).status = (lastError as Error & { status?: number })?.status;
    throw err;
  }

  async testConnection(): Promise<PelagicConnectionTestResult> {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const nextDay = new Date(yesterday);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const date = yesterday.toISOString().slice(0, 10);
    const nextDate = nextDay.toISOString().slice(0, 10);
    const testOptions = {
      dateFrom: `${date} 00:00:00`,
      dateTo: `${nextDate} 00:00:00`,
      deviceInfo: false,
      withLastSeen: false,
    };

    const tests: PelagicExportTestResult[] = [];

    for (const exportType of ['trips', 'points'] as const) {
      try {
        const result =
          exportType === 'trips'
            ? await this.exportTrips(testOptions)
            : await this.exportPoints({ ...testOptions, errant: false });

        tests.push({
          exportType,
          ok: true,
          httpStatus: result.httpStatus,
          message: `HTTP ${result.httpStatus} — export ${exportType} accessible`,
        });
        await result.cleanup();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erreur Pelagic inconnue';
        tests.push({
          exportType,
          ok: false,
          httpStatus: (error as Error & { status?: number }).status,
          message,
        });
      }
    }

    const tripsOk = tests.find((test) => test.exportType === 'trips')?.ok ?? false;
    const pointsOk = tests.find((test) => test.exportType === 'points')?.ok ?? false;

    let message: string;
    if (tripsOk && pointsOk) {
      message = 'Connexion Pelagic opérationnelle (trips et points, test non persisté)';
    } else if (tripsOk) {
      message =
        'Connexion partielle : trips OK, points en échec — vérifiez l\'abonnement Pelagic ou contactez le support';
    } else if (pointsOk) {
      message = 'Connexion partielle : points OK, trips en échec — vérifiez token/secret dans .env';
    } else {
      message = 'Connexion Pelagic échouée (trips et points) — vérifiez token/secret dans .env';
    }

    return { ok: tripsOk && pointsOk, message, tests };
  }
}

export const pelagicDataService = new PelagicDataService();
