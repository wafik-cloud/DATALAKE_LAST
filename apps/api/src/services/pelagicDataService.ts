import axios, { AxiosError } from 'axios';
import { env, pelagicConfigured } from '../config/env';
import { PelagicExportOptions, PelagicExportType } from '../types/pelagic';
import { redactSensitiveText } from '../utils/maskSecret';

export interface PelagicFetchResult {
  buffer: Buffer;
  httpStatus: number;
  contentType?: string;
  attemptCount: number;
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

export class PelagicDataService {
  buildUrl(exportType: PelagicExportType, options: PelagicExportOptions): string {
    const { dateFrom, dateTo, imeis, deviceInfo, withLastSeen, errant, tags } = options;
    const base = `${env.pelagic.baseUrl}/${env.pelagic.token}/v1/${exportType}/${dateFrom}/${dateTo}`;
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
        const response = await axios.get<ArrayBuffer>(url, {
          headers: {
            'X-API-SECRET': env.pelagic.secret,
            Accept: 'text/csv',
          },
          responseType: 'arraybuffer',
          timeout: env.pelagic.httpTimeoutMs,
          validateStatus: () => true,
        });

        if (response.status >= 400) {
          const bodyPreview = Buffer.from(response.data).toString('utf8').slice(0, 200);
          const redact = (text: string) => redactSensitiveText(text, [env.pelagic.token, env.pelagic.secret]);
          const err = new Error(formatPelagicHttpError(response.status, bodyPreview, exportType, redact));
          (err as Error & { status?: number }).status = response.status;
          throw err;
        }

        return {
          buffer: Buffer.from(response.data),
          httpStatus: response.status,
          contentType:
            response.headers['content-type'] != null
              ? String(response.headers['content-type'])
              : undefined,
          attemptCount: attempt,
        };
      } catch (error) {
        lastError = error;
        if (attempt >= env.pelagic.maxRetries || !this.shouldRetry(error)) break;
        await this.delay(attempt * 2000);
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'Erreur Pelagic inconnue';
    throw new Error(redactSensitiveText(message, [env.pelagic.token, env.pelagic.secret]));
  }

  async testConnection(): Promise<PelagicConnectionTestResult> {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const date = yesterday.toISOString().slice(0, 10);
    const testOptions = {
      dateFrom: date,
      dateTo: date,
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
