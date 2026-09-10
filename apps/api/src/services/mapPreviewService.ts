import { Readable } from 'stream';
import readline from 'readline';
import { env } from '../config/env';
import { minioStorageService } from './minioStorageService';
import { buildMapPreviewObjectKey } from '../utils/objectKeys';

export interface MapPreviewPoint {
  vessel: string;
  trip: string;
  lat: number;
  lng: number;
  time: string | null;
  speed: number | null;
  heading: number | null;
  vesselName: string | null;
  registration: string | null;
  boatId: string | null;
  deviceId: string | null;
  imei: string | null;
  status?: string | null;
  sourceRow?: number;
}

export interface MapPreviewTrack {
  trip: string;
  vessel: string;
  vesselName: string | null;
  registration: string | null;
  boatId: string | null;
  deviceId: string | null;
  imei: string | null;
  startTime: string | null;
  endTime: string | null;
  pointCount: number;
  minSpeed: number | null;
  maxSpeed: number | null;
  avgSpeed: number | null;
  displayedPoints: number;
}

export interface MapPreview {
  schemaVersion: 3;
  source: 'Pelagic Data System';
  bucket: string;
  sourceObjectKey: string;
  previewObjectKey: string;
  generatedAt: string;
  scannedRows: number;
  totalTracks: number;
  displayedTracks: number;
  displayedPoints: number;
  tracks: MapPreviewTrack[];
  trackPoints: MapPreviewPoint[];
}

type DraftTrack = Omit<MapPreviewTrack, 'points' | 'avgSpeed'> & {
  points: MapPreviewPoint[];
  speedSum: number;
  speedCount: number;
};

const MOROCCO_MAP_BOUNDS = {
  minLng: -18,
  maxLng: -0.5,
  minLat: 20.5,
  maxLat: 36.8,
};

const MAX_POINTS_PER_VESSEL = 1500;
const MAX_TOTAL_PREVIEW_POINTS = 60000;

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function valuesToRow(headers: string[], values: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  headers.forEach((header, index) => {
    row[header] = values[index]?.trim() || '';
  });
  return row;
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function parseDateValue(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\+00$/, 'Z');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function cleanText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function pick(row: Record<string, string>, names: string[]): string | undefined {
  return names.map((name) => row[name]).find((value) => value?.trim());
}

function pointInMapBounds(lat: number, lng: number): boolean {
  return (
    lat >= MOROCCO_MAP_BOUNDS.minLat &&
    lat <= MOROCCO_MAP_BOUNDS.maxLat &&
    lng >= MOROCCO_MAP_BOUNDS.minLng &&
    lng <= MOROCCO_MAP_BOUNDS.maxLng
  );
}

function buildPoint(row: Record<string, string>, sourceRow: number): MapPreviewPoint | null {
  const lat = parseNumber(row.Lat);
  const lng = parseNumber(row.Lng);
  if (lat == null || lng == null || !pointInMapBounds(lat, lng)) return null;

  const trip = cleanText(pick(row, ['Trip', 'Trip Id', 'Trip ID'])) || 'Voyage non renseigné';
  const vesselName = cleanText(pick(row, ['Boat Name', 'Vessel Name', 'Name']));
  const boatId = cleanText(pick(row, ['Boat', 'Boat Id', 'Boat ID', 'Vessel']));
  const deviceId = cleanText(pick(row, ['Device Id', 'Device ID', 'Device']));
  const imei = cleanText(pick(row, ['IMEI', 'Imei']));
  const registration = cleanText(pick(row, ['Registration', 'Immatriculation', 'CFR']));
  const status = cleanText(pick(row, ['Status', 'State']));
  const vessel = vesselName || registration || boatId || deviceId || imei || 'Bateau non renseigné';

  return {
    vessel,
    trip,
    lat,
    lng,
    time: parseDateValue(row.Time),
    speed: parseNumber(row['Speed (M/S)']),
    heading: parseNumber(row.Heading),
    vesselName,
    registration,
    boatId,
    deviceId,
    imei,
    status,
    sourceRow,
  };
}

function appendPreviewPoint(track: DraftTrack, point: MapPreviewPoint) {
  if (track.points.length < MAX_POINTS_PER_VESSEL) {
    track.points.push(point);
    return;
  }

  const replaceEvery = Math.ceil(track.pointCount / MAX_POINTS_PER_VESSEL);
  if (replaceEvery > 0 && track.pointCount % replaceEvery === 0) {
    const index = Math.max(1, Math.min(MAX_POINTS_PER_VESSEL - 2, Math.floor(track.pointCount / replaceEvery)));
    track.points[index] = point;
  }
  track.points[MAX_POINTS_PER_VESSEL - 1] = point;
}

async function generateMapPreviewFromStream(sourceObjectKey: string, stream: Readable): Promise<MapPreview> {
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const tracks = new Map<string, DraftTrack>();
  let headers: string[] | null = null;
  let scannedRows = 0;

  for await (const rawLine of lines) {
    const line = rawLine.replace(/^\uFEFF/, '').trimEnd();
    if (!line.trim()) continue;

    const values = parseCsvLine(line);
    if (!headers) {
      headers = values.map((value) => value.trim());
      continue;
    }

    scannedRows += 1;
    const row = valuesToRow(headers, values);

    const point = buildPoint(row, scannedRows);
    if (!point) continue;

    const existing = tracks.get(point.vessel);
    const track: DraftTrack = existing || {
      trip: point.trip,
      vessel: point.vessel,
      vesselName: point.vesselName,
      registration: point.registration,
      boatId: point.boatId,
      deviceId: point.deviceId,
      imei: point.imei,
      startTime: point.time,
      endTime: point.time,
      pointCount: 0,
      minSpeed: null,
      maxSpeed: null,
      speedSum: 0,
      speedCount: 0,
      displayedPoints: 0,
      points: [],
    };

    track.pointCount += 1;
    track.startTime = !track.startTime || (point.time && point.time < track.startTime) ? point.time : track.startTime;
    track.endTime = !track.endTime || (point.time && point.time > track.endTime) ? point.time : track.endTime;
    if (point.speed != null) {
      track.minSpeed = track.minSpeed == null || point.speed < track.minSpeed ? point.speed : track.minSpeed;
      track.maxSpeed = track.maxSpeed == null || point.speed > track.maxSpeed ? point.speed : track.maxSpeed;
      track.speedSum += point.speed;
      track.speedCount += 1;
    }
    appendPreviewPoint(track, point);
    track.displayedPoints = track.points.length;
    tracks.set(point.vessel, track);
  }

  const previewObjectKey = buildMapPreviewObjectKey(sourceObjectKey);
  const drafts = Array.from(tracks.values()).map((track) => {
    const points = track.points
      .filter(Boolean)
      .slice()
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return {
      trip: track.trip,
      vessel: track.vessel,
      vesselName: track.vesselName,
      registration: track.registration,
      boatId: track.boatId,
      deviceId: track.deviceId,
      imei: track.imei,
      startTime: track.startTime,
      endTime: track.endTime,
      pointCount: track.pointCount,
      minSpeed: track.minSpeed,
      maxSpeed: track.maxSpeed,
      avgSpeed: track.speedCount ? Number((track.speedSum / track.speedCount).toFixed(3)) : null,
      displayedPoints: points.length,
      points,
    };
  });

  const sortedDrafts = drafts.sort((a, b) => b.pointCount - a.pointCount);
  const selectedPoints: MapPreviewPoint[] = [];
  const normalizedTracks: MapPreviewTrack[] = [];

  for (const track of sortedDrafts) {
    const remaining = MAX_TOTAL_PREVIEW_POINTS - selectedPoints.length;
    if (remaining <= 0) {
      normalizedTracks.push({
        trip: track.trip,
        vessel: track.vessel,
        vesselName: track.vesselName,
        registration: track.registration,
        boatId: track.boatId,
        deviceId: track.deviceId,
        imei: track.imei,
        startTime: track.startTime,
        endTime: track.endTime,
        pointCount: track.pointCount,
        minSpeed: track.minSpeed,
        maxSpeed: track.maxSpeed,
        avgSpeed: track.avgSpeed,
        displayedPoints: 0,
      });
      continue;
    }
    const points = track.points.length > remaining ? track.points.slice(0, remaining) : track.points;
    selectedPoints.push(...points);
    normalizedTracks.push({
      trip: track.trip,
      vessel: track.vessel,
      vesselName: track.vesselName,
      registration: track.registration,
      boatId: track.boatId,
      deviceId: track.deviceId,
      imei: track.imei,
      startTime: track.startTime,
      endTime: track.endTime,
      pointCount: track.pointCount,
      minSpeed: track.minSpeed,
      maxSpeed: track.maxSpeed,
      avgSpeed: track.avgSpeed,
      displayedPoints: points.length,
    });
  }

  return {
    schemaVersion: 3,
    source: 'Pelagic Data System',
    bucket: env.minio.bucket,
    sourceObjectKey,
    previewObjectKey,
    generatedAt: new Date().toISOString(),
    scannedRows,
    totalTracks: tracks.size,
    displayedTracks: normalizedTracks.filter((track) => track.displayedPoints > 0).length,
    displayedPoints: selectedPoints.length,
    tracks: normalizedTracks,
    trackPoints: selectedPoints,
  };
}

async function streamToText(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export async function createAndStoreMapPreview(sourceObjectKey: string, stream: Readable): Promise<MapPreview> {
  const preview = await generateMapPreviewFromStream(sourceObjectKey, stream);
  await minioStorageService.uploadObject({
    key: preview.previewObjectKey,
    body: Buffer.from(JSON.stringify(preview)),
    contentType: 'application/json',
    metadata: {
      'source-object-key': sourceObjectKey,
      'preview-type': 'vessel-map',
      'generated-at': preview.generatedAt,
    },
  });
  return preview;
}

export async function createAndStoreMapPreviewFromBuffer(sourceObjectKey: string, buffer: Buffer): Promise<MapPreview> {
  return createAndStoreMapPreview(sourceObjectKey, Readable.from(buffer));
}

export async function getOrCreateMapPreview(sourceObjectKey: string): Promise<MapPreview> {
  const previewObjectKey = buildMapPreviewObjectKey(sourceObjectKey);
  if (await minioStorageService.objectExists(previewObjectKey)) {
    const metadata = await minioStorageService.getObjectMetadata(previewObjectKey);
    if (metadata.size < 30 * 1024 * 1024) {
      const stream = await minioStorageService.downloadObject(previewObjectKey);
      const cached = JSON.parse(await streamToText(stream)) as Partial<MapPreview>;
      if (cached.schemaVersion === 3) {
        return cached as MapPreview;
      }
    }
  }

  const csvStream = await minioStorageService.downloadObject(sourceObjectKey);
  return createAndStoreMapPreview(sourceObjectKey, csvStream);
}

export async function getMapPreviewSourceRow(sourceObjectKey: string, sourceRow: number) {
  if (!Number.isInteger(sourceRow) || sourceRow < 1) {
    throw new Error('Numéro de ligne invalide');
  }

  const stream = await minioStorageService.downloadObject(sourceObjectKey);
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] | null = null;
  let currentRow = 0;

  for await (const rawLine of lines) {
    const line = rawLine.replace(/^\uFEFF/, '').trimEnd();
    if (!line.trim()) continue;
    const values = parseCsvLine(line);
    if (!headers) {
      headers = values.map((value) => value.trim());
      continue;
    }
    currentRow += 1;
    if (currentRow === sourceRow) {
      return {
        sourceRow,
        columns: headers,
        raw: valuesToRow(headers, values),
      };
    }
  }

  throw new Error('Ligne source introuvable');
}
