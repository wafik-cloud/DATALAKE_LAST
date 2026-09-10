import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  PlayCircle,
  TableProperties,
  XCircle,
} from 'lucide-react';
import Papa from 'papaparse';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import CSVImporter from '../../components/vessel-map/CSVImporter';
import MapView from '../../components/vessel-map/MapView';
import PlaybackControls from '../../components/vessel-map/PlaybackControls';
import VesselDetails from '../../components/vessel-map/VesselDetails';
import VesselList from '../../components/vessel-map/VesselList';
import { pointAtTrackProgress, pointAtTrackTime, globalTimeRange } from '../../lib/vesselMap/animationEngine';
import { buildVesselTracks, parseVesselCsv } from '../../lib/vesselMap/csvParser';
import { timeMs } from '../../lib/vesselMap/timeUtils';
import type { AnimatedVesselState, VesselTrack, VesselTrackPoint } from '../../lib/vesselMap/types';

export type { VesselTrackPoint } from '../../lib/vesselMap/types';

type ColumnStats = {
  name: string;
  missing: number;
  examples: string[];
};

export type FileReport = {
  fileName: string;
  fileSize: number;
  rowCount: number;
  columnCount: number;
  columns: string[];
  missingTotal: number;
  badTime: number;
  invalidLat: number;
  invalidLng: number;
  negativeSpeed: number;
  speedAbove15: number;
  minSpeed: number | null;
  maxSpeed: number | null;
  minTime: string | null;
  maxTime: string | null;
  columnStats: ColumnStats[];
  trackPoints: VesselTrackPoint[];
  generatedAt: string;
};

type ChecklistItem = {
  label: string;
  ok: boolean;
  detail: string;
};

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

function parseDate(value: string): Date | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\+00$/, 'Z');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

function shortNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
}

function buildChecklist(report: FileReport): ChecklistItem[] {
  const hasTimeColumn = report.columns.includes('Time');
  const hasLatColumn = report.columns.includes('Lat');
  const hasLngColumn = report.columns.includes('Lng');
  const hasSpeedColumn = report.columns.includes('Speed (M/S)');

  return [
    {
      label: 'Fichier lisible',
      ok: report.columnCount > 0,
      detail: report.columnCount > 0 ? 'En-tête CSV détecté' : 'Aucune colonne détectée',
    },
    {
      label: 'Données présentes',
      ok: report.rowCount > 0,
      detail: `${formatNumber(report.rowCount)} ligne(s) de données`,
    },
    {
      label: 'Colonnes détectées',
      ok: report.columnCount > 0,
      detail: `${report.columnCount} colonne(s)`,
    },
    {
      label: 'Valeurs obligatoires',
      ok: report.missingTotal === 0,
      detail: report.missingTotal === 0 ? 'Aucune valeur manquante' : `${formatNumber(report.missingTotal)} valeur(s) manquante(s)`,
    },
    {
      label: 'Champ Time',
      ok: hasTimeColumn && report.badTime === 0,
      detail: hasTimeColumn
        ? report.badTime === 0
          ? 'Toutes les dates Time sont lisibles'
          : `${formatNumber(report.badTime)} date(s) Time invalide(s)`
        : 'Colonne Time absente',
    },
    {
      label: 'Latitude',
      ok: hasLatColumn && report.invalidLat === 0,
      detail: hasLatColumn
        ? report.invalidLat === 0
          ? 'Toutes les latitudes sont entre -90 et 90'
          : `${formatNumber(report.invalidLat)} latitude(s) invalide(s)`
        : 'Colonne Lat absente',
    },
    {
      label: 'Longitude',
      ok: hasLngColumn && report.invalidLng === 0,
      detail: hasLngColumn
        ? report.invalidLng === 0
          ? 'Toutes les longitudes sont entre -180 et 180'
          : `${formatNumber(report.invalidLng)} longitude(s) invalide(s)`
        : 'Colonne Lng absente',
    },
    {
      label: 'Vitesses négatives',
      ok: hasSpeedColumn && report.negativeSpeed === 0,
      detail: hasSpeedColumn
        ? report.negativeSpeed === 0
          ? 'Aucune vitesse négative'
          : `${formatNumber(report.negativeSpeed)} vitesse(s) négative(s)`
        : 'Colonne Speed (M/S) absente',
    },
    {
      label: 'Vitesses élevées',
      ok: hasSpeedColumn && report.speedAbove15 === 0,
      detail: hasSpeedColumn
        ? report.speedAbove15 === 0
          ? 'Aucune vitesse au-dessus de 15 m/s'
          : `${formatNumber(report.speedAbove15)} vitesse(s) au-dessus de 15 m/s`
        : 'Colonne Speed (M/S) absente',
    },
  ];
}

function reportToMarkdown(report: FileReport): string {
  return `# CSV Quality Control Report

## File

- File name: ${report.fileName}
- File size: ${formatBytes(report.fileSize)}
- Generated at: ${report.generatedAt}

## Summary

- Rows: ${report.rowCount}
- Columns: ${report.columnCount}
- Missing values: ${report.missingTotal}
- Invalid Time values: ${report.badTime}
- Invalid latitude values: ${report.invalidLat}
- Invalid longitude values: ${report.invalidLng}
- Negative speed values: ${report.negativeSpeed}
- Speed values above 15 m/s: ${report.speedAbove15}
- Min Time: ${report.minTime || 'Not available'}
- Max Time: ${report.maxTime || 'Not available'}
- Min Speed: ${report.minSpeed ?? 'Not available'}
- Max Speed: ${report.maxSpeed ?? 'Not available'}
- Map points sampled: ${report.trackPoints.length}

## Columns

| Column | Missing values | Examples |
|---|---:|---|
${report.columnStats
  .map((column) => `| ${column.name} | ${column.missing} | ${column.examples.join(', ') || 'No example'} |`)
  .join('\n')}
`;
}

function downloadText(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function VesselActivityMap({
  points,
  loadPointDetails,
}: {
  points: VesselTrackPoint[];
  loadPointDetails?: (point: VesselTrackPoint) => Promise<Record<string, string> | null>;
}) {
  const animationFrameRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [progress, setProgress] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [singleMode, setSingleMode] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<AnimatedVesselState | null>(null);
  const [rawRows, setRawRows] = useState<Map<number, Record<string, string>>>(new Map());

  const tracks = useMemo(() => buildVesselTracks(points).filter((track) => track.points.length > 0), [points]);
  const timeline = useMemo(() => globalTimeRange(tracks), [tracks]);
  const visibleTracks = useMemo(
    () => tracks.filter((track) => visibleIds.has(track.id) && (!singleMode || !selectedId || track.id === selectedId)),
    [tracks, visibleIds, singleMode, selectedId]
  );
  const usesTime = timeline.max > 1 && tracks.some((track) => track.points.some((point) => timeMs(point.time) != null));

  useEffect(() => {
    runIdRef.current += 1;
    if (animationFrameRef.current != null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setProgress(0);
    setPlaying(points.length > 0);
    setSelectedId(null);
    setSelectedSnapshot(null);
    setRawRows(new Map());
    setVisibleIds(new Set(tracks.map((track) => track.id)));
  }, [points, tracks]);

  const currentTime = usesTime ? timeline.min + (timeline.max - timeline.min) * progress : progress;

  const states = useMemo(
    () => visibleTracks
      .map((track) => (usesTime ? pointAtTrackTime(track, currentTime) : pointAtTrackProgress(track, progress)))
      .filter((state): state is AnimatedVesselState => Boolean(state)),
    [visibleTracks, usesTime, currentTime, progress]
  );

  const selectedState = useMemo(() => {
    const state = states.find((item) => item.track.id === selectedId) || selectedSnapshot;
    if (!state) return null;
    const sourceRow = state.point.sourceRow;
    const raw = sourceRow ? rawRows.get(sourceRow) : undefined;
    return raw ? { ...state, point: { ...state.point, raw } } : state;
  }, [states, selectedId, selectedSnapshot, rawRows]);

  useEffect(() => {
    const sourceRow = selectedState?.point.sourceRow;
    if (!sourceRow || !loadPointDetails || selectedState.point.raw || rawRows.has(sourceRow)) return undefined;
    let cancelled = false;
    loadPointDetails(selectedState.point)
      .then((raw) => {
        if (!cancelled && raw) {
          setRawRows((current) => new Map(current).set(sourceRow, raw));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedState?.point.sourceRow, selectedState?.point.raw, loadPointDetails, rawRows]);

  useEffect(() => {
    if (!playing || !tracks.length) return undefined;
    const runId = runIdRef.current;
    let previous = performance.now();

    const tick = (now: number) => {
      if (runId !== runIdRef.current) return;
      const elapsed = now - previous;
      previous = now;
      setProgress((value) => {
        const next = value + (elapsed / 45000) * speed;
        return next >= 1 ? 1 : next;
      });
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [playing, speed, tracks.length]);

  useEffect(() => {
    if (progress >= 1) setPlaying(false);
  }, [progress]);

  function toggleVisible(id: string) {
    setVisibleIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function stop() {
    runIdRef.current += 1;
    if (animationFrameRef.current != null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setPlaying(false);
    setProgress(0);
    setSelectedSnapshot(null);
  }

  function restart() {
    runIdRef.current += 1;
    if (animationFrameRef.current != null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setPlaying(false);
    setProgress(0);
    setSelectedSnapshot(null);
    window.requestAnimationFrame(() => {
      runIdRef.current += 1;
      setPlaying(true);
    });
  }

  function selectTrack(id: string | null, snapshot?: AnimatedVesselState) {
    setSelectedId(id);
    setSelectedSnapshot(snapshot || null);
    if (id) setVisibleIds((current) => new Set(current).add(id));
  }

  useEffect(() => {
    if (singleMode && !selectedId && visibleTracks[0]) {
      setSelectedId(visibleTracks[0].id);
    }
  }, [singleMode, selectedId, visibleTracks]);

  return (
    <section className="card qc-map-panel vessel-map-panel">
      <div className="section-head">
        <h2>Carte d'activité des bateaux</h2>
        <div className="actions">
          <label className="vessel-mode-toggle">
            <input type="checkbox" checked={singleMode} onChange={(event) => setSingleMode(event.target.checked)} />
            <span>Mode bateau sélectionné</span>
          </label>
        </div>
      </div>

      <div className="vessel-map-layout">
        <VesselList
          tracks={tracks}
          visibleIds={visibleIds}
          selectedId={selectedId}
          onToggle={toggleVisible}
          onSelect={(id) => selectTrack(id)}
        />
        <MapView
          tracks={visibleTracks}
          states={states}
          selectedId={selectedId}
          onSelect={selectTrack}
        />
        <VesselDetails state={selectedState} />
      </div>

      <PlaybackControls
        playing={playing}
        progress={progress}
        speed={speed}
        onPlayPause={() => setPlaying((value) => !value)}
        onStop={stop}
        onRestart={restart}
        onSpeedChange={setSpeed}
        onProgressChange={(value) => {
          setProgress(value);
          setPlaying(false);
        }}
      />

      <div className="vessel-map-summary">
        <span>{formatNumber(points.length)} positions valides</span>
        <span>{formatNumber(tracks.length)} bateaux</span>
        <span>{points.length ? (usesTime ? `Horloge: ${new Date(currentTime).toLocaleString('fr-FR')}` : 'Animation par ordre des points') : 'Carte initiale du Maroc'}</span>
      </div>
    </section>
  );
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function findColumn(headers: string[], aliases: string[]): string | null {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  for (const alias of aliases) {
    const column = normalized.get(normalizeHeader(alias));
    if (column) return column;
  }
  return null;
}

function cell(row: Record<string, unknown>, column: string | null): string {
  if (!column) return '';
  const value = row[column];
  return value == null ? '' : String(value).trim();
}

function asNumber(value: string): number | null {
  if (!value) return null;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

export async function analyseCsv(file: File): Promise<FileReport> {
  const parsed = await new Promise<Papa.ParseResult<Record<string, unknown>>>((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete: resolve,
      error: reject,
    });
  });

  const headers = parsed.meta.fields || [];
  const rows = parsed.data;
  const latColumn = findColumn(headers, ['latitude', 'lat']);
  const lngColumn = findColumn(headers, ['longitude', 'lon', 'lng', 'long']);
  const timeColumn = findColumn(headers, ['timestamp', 'datetime', 'date', 'time']);
  const speedColumn = findColumn(headers, ['speed', 'speed (m/s)', 'speed_m_s', 'sog']);

  let missingTotal = 0;
  let badTime = 0;
  let invalidLat = 0;
  let invalidLng = 0;
  let negativeSpeed = 0;
  let speedAbove15 = 0;
  let minSpeed: number | null = null;
  let maxSpeed: number | null = null;
  let minTime: Date | null = null;
  let maxTime: Date | null = null;
  const columnStats: ColumnStats[] = headers.map((name) => ({ name, missing: 0, examples: [] }));

  rows.forEach((row) => {
    headers.forEach((header, index) => {
      const value = cell(row, header);
      if (!value) {
        missingTotal += 1;
        columnStats[index].missing += 1;
      } else if (columnStats[index].examples.length < 3 && !columnStats[index].examples.includes(value)) {
        columnStats[index].examples.push(value.length > 36 ? `${value.slice(0, 33)}...` : value);
      }
    });

    const rawTime = cell(row, timeColumn);
    if (timeColumn && rawTime) {
      const time = parseDate(rawTime);
      if (!time) {
        badTime += 1;
      } else {
        minTime = !minTime || time < minTime ? time : minTime;
        maxTime = !maxTime || time > maxTime ? time : maxTime;
      }
    }

    const lat = asNumber(cell(row, latColumn));
    const lng = asNumber(cell(row, lngColumn));
    if (latColumn && (lat == null || lat < -90 || lat > 90)) invalidLat += 1;
    if (lngColumn && (lng == null || lng < -180 || lng > 180)) invalidLng += 1;

    const speed = asNumber(cell(row, speedColumn));
    if (speedColumn && speed != null) {
      minSpeed = minSpeed === null || speed < minSpeed ? speed : minSpeed;
      maxSpeed = maxSpeed === null || speed > maxSpeed ? speed : maxSpeed;
      if (speed < 0) negativeSpeed += 1;
      if (speed > 15) speedAbove15 += 1;
    }
  });

  const parsedVessels = await parseVesselCsv(file);

  return {
    fileName: file.name,
    fileSize: file.size,
    rowCount: rows.length,
    columnCount: headers.length,
    columns: headers,
    missingTotal,
    badTime,
    invalidLat,
    invalidLng,
    negativeSpeed,
    speedAbove15,
    minSpeed,
    maxSpeed,
    minTime: minTime ? minTime.toISOString() : null,
    maxTime: maxTime ? maxTime.toISOString() : null,
    columnStats,
    trackPoints: parsedVessels.points,
    generatedAt: new Date().toISOString(),
  };
}

export default function QualityControlPage() {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<FileReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issueCount = useMemo(() => {
    if (!report) return 0;
    return report.missingTotal + report.badTime + report.invalidLat + report.invalidLng + report.negativeSpeed;
  }, [report]);

  const checklist = useMemo(() => (report ? buildChecklist(report) : []), [report]);

  function selectFile(selected: File) {
    setFile(selected);
    setReport(null);
    setError(null);
  }

  async function runQualityControl() {
    if (!file) return;
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const result = await analyseCsv(file);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyse impossible');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="qc-page">
      <PageHeader
        title="Contrôle qualité CSV"
        subtitle="Sélection d'un fichier local, analyse en lecture seule, affichage et export du rapport"
        actions={
          <>
            <CSVImporter fileName={file?.name || null} onFile={selectFile} />
            <button type="button" className="btn primary" disabled={!file || running} onClick={runQualityControl}>
              <PlayCircle size={16} /> {running ? 'Analyse...' : 'Lancer QC'}
            </button>
          </>
        }
      />

      <div className="qc-workspace">
        <section className="card qc-upload-panel">
          <div className="qc-drop-zone">
            <FileText size={34} />
            <strong>{file ? file.name : 'Aucun fichier sélectionné'}</strong>
            <span>{file ? formatBytes(file.size) : 'Utilisez le bouton Importer CSV pour choisir un fichier local'}</span>
          </div>
          <p className="hint">
            Le fichier est analysé dans le navigateur. Il n'est pas envoyé au serveur, ce qui limite l'exposition des
            identifiants sensibles.
          </p>
        </section>

        {!report && !running && !error && <VesselActivityMap points={[]} />}

        {error && (
          <div className="alert">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {running && (
          <div className="card qc-running">
            <span className="qc-spinner" />
            Analyse du fichier en cours. Les grands fichiers peuvent prendre plusieurs minutes.
          </div>
        )}

        {report && (
          <>
            <div className="grid cards">
              <StatCard icon={<TableProperties size={18} />} label="Lignes" value={formatNumber(report.rowCount)} />
              <StatCard icon={<FileText size={18} />} label="Colonnes" value={String(report.columnCount)} />
              <StatCard
                icon={<CheckCircle2 size={18} />}
                label="Contrôles"
                value={issueCount === 0 ? 'OK' : formatNumber(issueCount)}
                hint={issueCount === 0 ? 'Aucune anomalie simple détectée' : 'Anomalies simples détectées'}
                tone={issueCount === 0 ? 'success' : 'warning'}
              />
              <StatCard
                icon={<AlertTriangle size={18} />}
                label="Vitesse max"
                value={report.maxSpeed === null ? '-' : `${report.maxSpeed} m/s`}
                hint={report.speedAbove15 ? `${formatNumber(report.speedAbove15)} valeurs > 15 m/s` : 'Seuil 15 m/s'}
                tone={report.speedAbove15 ? 'warning' : 'default'}
              />
            </div>

            <section className="card qc-summary">
              <div className="section-head">
                <h2>Résumé</h2>
                <div className="actions">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() =>
                      downloadText(
                        `${report.fileName.replace(/\.csv$/i, '')}_qc_report.json`,
                        JSON.stringify(report, null, 2),
                        'application/json'
                      )
                    }
                  >
                    <Download size={14} /> JSON
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() =>
                      downloadText(
                        `${report.fileName.replace(/\.csv$/i, '')}_qc_report.md`,
                        reportToMarkdown(report),
                        'text/markdown'
                      )
                    }
                  >
                    <Download size={14} /> Markdown
                  </button>
                </div>
              </div>

              <dl className="qc-kv">
                <div><dt>Fichier</dt><dd>{report.fileName}</dd></div>
                <div><dt>Période Time</dt><dd>{report.minTime || '-'} → {report.maxTime || '-'}</dd></div>
                <div><dt>Valeurs manquantes</dt><dd>{formatNumber(report.missingTotal)}</dd></div>
                <div><dt>Dates invalides</dt><dd>{formatNumber(report.badTime)}</dd></div>
                <div><dt>Lat/Lng invalides</dt><dd>{formatNumber(report.invalidLat)} / {formatNumber(report.invalidLng)}</dd></div>
                <div><dt>Vitesses négatives</dt><dd>{formatNumber(report.negativeSpeed)}</dd></div>
              </dl>
            </section>

            <section className="card qc-checklist-panel">
              <div className="section-head">
                <h2>Checklist des contrôles</h2>
                <span className={checklist.every((item) => item.ok) ? 'badge SUCCESS' : 'badge WARNING'}>
                  {checklist.filter((item) => item.ok).length}/{checklist.length} OK
                </span>
              </div>
              <div className="qc-checklist">
                {checklist.map((item) => (
                  <div key={item.label} className={item.ok ? 'qc-check-item ok' : 'qc-check-item ko'}>
                    <span className="qc-check-icon">
                      {item.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <VesselActivityMap points={report.trackPoints} />

            <section className="erp-table-panel card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Colonne</th>
                      <th>Valeurs manquantes</th>
                      <th>Exemples</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.columnStats.map((column) => (
                      <tr key={column.name}>
                        <td>{column.name}</td>
                        <td>{formatNumber(column.missing)}</td>
                        <td>{column.examples.join(', ') || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
