/**
 * Jointure trips Pelagic × immatriculation bateau (contournement Ian).
 *
 * L'export trips ne contient pas l'immatriculation. On la rattache après coup
 * en appelant GET /v1/boats/info et en faisant correspondre le "Device Id" du
 * trip au "deviceId" du bateau.
 *
 * Limites Pelagic, à laisser visibles (ne pas les corriger ici) :
 * - Le deviceId du bateau est l'appareil installé maintenant, pas celui qui
 *   était à bord au moment du trip.
 * - Appareil retiré du bateau : aucune correspondance, colonnes d'immatriculation vides.
 * - Appareil réinstallé ensuite sur un autre bateau : les anciens trips sont
 *   étiquetés comme ce nouveau bateau, sans aucun indicateur dans le fichier.
 * - Un numéro d'immatriculation mal formé vient de la saisie du tableau de bord
 *   Pelagic, pas de cette jointure : la valeur est recopiée telle quelle.
 * - La plage de dates filtre l'heure de fin du trip. Plafond : 10 000 trips
 *   par requête ; au-delà la réponse peut être tronquée.
 */

export const TRIP_REGISTRATION_FIELDS = [
  'registrationNumber',
  'registrationAuthority',
  'registrationExpiration',
  'flag',
  'ownerName',
] as const;

export const PELAGIC_TRIPS_ROW_LIMIT = 10_000;

export interface PelagicBoatRecord {
  deviceId?: string | number | null;
  registrationNumber?: string | number | null;
  registrationAuthority?: string | null;
  registrationExpiration?: string | number | null;
  flag?: string | null;
  ownerName?: string | null;
}

export interface TripRegistrationJoinResult {
  csv: string;
  rowCount: number;
  unmatched: number;
  headerLine: string;
  deviceIdColumnMissing: boolean;
  hitRowLimit: boolean;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toCsv(rows: string[][]): string {
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/** registrationExpiration Pelagic est un epoch en millisecondes, écrit en YYYY-MM-DD UTC. */
export function formatRegistrationExpiration(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return new Date(Number(value.trim())).toISOString().slice(0, 10);
  }
  return String(value);
}

function registrationCells(boat: PelagicBoatRecord | undefined): string[] {
  if (!boat) return TRIP_REGISTRATION_FIELDS.map(() => '');
  return TRIP_REGISTRATION_FIELDS.map((field) => {
    if (field === 'registrationExpiration') return formatRegistrationExpiration(boat.registrationExpiration);
    return cellText(boat[field]);
  });
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === '');
}

/**
 * Dernier bateau gagnant si plusieurs fiches partagent le même deviceId.
 * Les bateaux sans deviceId (appareil retiré) ne sont pas indexés.
 */
export function indexBoatsByDevice(boats: PelagicBoatRecord[]): Map<string, PelagicBoatRecord> {
  const byDevice = new Map<string, PelagicBoatRecord>();
  for (const boat of boats) {
    if (boat?.deviceId === null || boat?.deviceId === undefined) continue;
    const deviceId = String(boat.deviceId).trim();
    if (!deviceId) continue;
    byDevice.set(deviceId, boat);
  }
  return byDevice;
}

/** True when the stored trips header already carries the five registration columns. */
export function headerHasBoatRegistration(headerLine: string): boolean {
  const names = headerLine
    .replace(/^\uFEFF/, '')
    .split(',')
    .map((name) => name.trim().replace(/^"|"$/g, ''));
  return TRIP_REGISTRATION_FIELDS.every((field) => names.includes(field));
}

export function joinTripsWithRegistration(
  csvText: string,
  boats: PelagicBoatRecord[]
): TripRegistrationJoinResult {
  const byDevice = indexBoatsByDevice(boats);
  const source = parseCsv(csvText.replace(/^\uFEFF/, ''));
  const header = source[0];
  if (!header || isBlankRow(header)) {
    throw new Error('CSV trips sans en-tête');
  }

  const deviceCol = header.findIndex((name) => name.replace(/^\uFEFF/, '').trim() === 'Device Id');
  const deviceIdColumnMissing = deviceCol < 0;
  const outHeader = [...header, ...TRIP_REGISTRATION_FIELDS];
  const outRows: string[][] = [outHeader];
  let unmatched = 0;

  for (const row of source.slice(1)) {
    if (isBlankRow(row)) continue;
    const padded = header.map((_, index) => row[index] ?? '');
    const deviceId = deviceIdColumnMissing ? '' : padded[deviceCol].trim();
    const boat = deviceId ? byDevice.get(deviceId) : undefined;
    if (!boat) unmatched += 1;
    outRows.push([...padded, ...registrationCells(boat)]);
  }

  const rowCount = outRows.length - 1;
  return {
    csv: toCsv(outRows),
    rowCount,
    unmatched,
    headerLine: outHeader.join(','),
    deviceIdColumnMissing,
    hitRowLimit: rowCount >= PELAGIC_TRIPS_ROW_LIMIT,
  };
}
