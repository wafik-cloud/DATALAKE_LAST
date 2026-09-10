import Papa from 'papaparse';
import { isValidCoordinate } from './geoUtils';
import { timeMs } from './timeUtils';
import type { CsvParseSummary, VesselTrack, VesselTrackPoint } from './types';

const COLORS = ['#0f6c8f', '#238b45', '#d17b0f', '#7c3aed', '#b91c4b', '#0f766e', '#2563eb', '#9a6b00', '#5b6f7a', '#c2410c'];

const FIELD_ALIASES = {
  lat: ['latitude', 'lat'],
  lng: ['longitude', 'lon', 'lng', 'long'],
  time: ['timestamp', 'datetime', 'date', 'time'],
  vesselId: ['vessel_id', 'boat_id', 'boat', 'vessel'],
  imei: ['imei'],
  registration: ['registration_number', 'registration', 'immatriculation', 'cfr'],
  vesselName: ['boat_name', 'vessel_name', 'boat name', 'name'],
  deviceId: ['device_id', 'device id', 'device'],
  speed: ['speed', 'speed (m/s)', 'speed_m_s', 'sog'],
  heading: ['heading', 'course', 'bearing', 'cog'],
  status: ['status', 'state'],
  trip: ['trip', 'trip_id', 'trip id', 'voyage'],
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function findColumn(headers: string[], aliases: string[]): string | null {
  const normalized = new Map(headers.map((header) => [normalize(header), header]));
  for (const alias of aliases) {
    const found = normalized.get(normalize(alias));
    if (found) return found;
  }
  return null;
}

function value(row: Record<string, unknown>, column: string | null): string {
  if (!column) return '';
  const raw = row[column];
  return raw == null ? '' : String(raw).trim();
}

function toNumber(raw: string): number | null {
  if (!raw) return null;
  const number = Number(raw.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

export function buildVesselTracks(points: VesselTrackPoint[]): VesselTrack[] {
  const groups = new Map<string, VesselTrackPoint[]>();
  points.forEach((point) => {
    const list = groups.get(point.vessel) || [];
    list.push(point);
    groups.set(point.vessel, list);
  });

  return Array.from(groups.entries()).map(([id, vesselPoints], index) => {
    const sorted = vesselPoints
      .slice()
      .sort((a, b) => (timeMs(a.time) ?? Number.MAX_SAFE_INTEGER) - (timeMs(b.time) ?? Number.MAX_SAFE_INTEGER));
    const first = sorted[0];
    return {
      id,
      name: first?.vesselName || first?.registration || id,
      color: COLORS[index % COLORS.length],
      metadata: {
        vesselName: first?.vesselName || null,
        registration: first?.registration || null,
        boatId: first?.boatId || null,
        deviceId: first?.deviceId || null,
        imei: first?.imei || null,
      },
      points: sorted,
    };
  });
}

export async function parseVesselCsv(file: File): Promise<CsvParseSummary> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete: (result) => {
        const columns = result.meta.fields || [];
        const latColumn = findColumn(columns, FIELD_ALIASES.lat);
        const lngColumn = findColumn(columns, FIELD_ALIASES.lng);
        const timeColumn = findColumn(columns, FIELD_ALIASES.time);
        const vesselIdColumn = findColumn(columns, FIELD_ALIASES.vesselId);
        const imeiColumn = findColumn(columns, FIELD_ALIASES.imei);
        const registrationColumn = findColumn(columns, FIELD_ALIASES.registration);
        const vesselNameColumn = findColumn(columns, FIELD_ALIASES.vesselName);
        const deviceIdColumn = findColumn(columns, FIELD_ALIASES.deviceId);
        const speedColumn = findColumn(columns, FIELD_ALIASES.speed);
        const headingColumn = findColumn(columns, FIELD_ALIASES.heading);
        const statusColumn = findColumn(columns, FIELD_ALIASES.status);
        const tripColumn = findColumn(columns, FIELD_ALIASES.trip);
        const points: VesselTrackPoint[] = [];
        let ignoredRows = 0;

        result.data.forEach((row) => {
          const lat = toNumber(value(row, latColumn));
          const lng = toNumber(value(row, lngColumn));
          if (lat == null || lng == null || !isValidCoordinate(lat, lng)) {
            ignoredRows += 1;
            return;
          }

          const vesselId = value(row, vesselIdColumn) || value(row, imeiColumn) || value(row, registrationColumn) || value(row, vesselNameColumn);
          if (!vesselId) {
            ignoredRows += 1;
            return;
          }

          const raw = Object.fromEntries(columns.map((column) => [column, value(row, column)]));
          points.push({
            vessel: vesselId,
            trip: value(row, tripColumn) || 'Voyage non renseigné',
            lat,
            lng,
            time: value(row, timeColumn) || null,
            speed: toNumber(value(row, speedColumn)),
            heading: toNumber(value(row, headingColumn)),
            vesselName: value(row, vesselNameColumn) || null,
            registration: value(row, registrationColumn) || null,
            boatId: value(row, vesselIdColumn) || null,
            deviceId: value(row, deviceIdColumn) || null,
            imei: value(row, imeiColumn) || null,
            status: value(row, statusColumn) || null,
            raw,
          });
        });

        const tracks = buildVesselTracks(points);
        resolve({
          totalRows: result.data.length,
          validRows: points.length,
          ignoredRows,
          vesselCount: tracks.length,
          columns,
          points,
          tracks,
        });
      },
      error: (error) => reject(error),
    });
  });
}
