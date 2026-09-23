import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Download, RotateCcw, MapPinned, X, CheckCircle2, Database, Timer, AlertTriangle } from 'lucide-react';
import { adminApi } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import LoadingOverlay from '../../components/LoadingOverlay';
import { confirmAction, showError, showSuccess, withLoading } from '../../lib/swal';
import { type VesselTrackPoint, VesselActivityMap } from './QualityControlPage';

interface PelagicJob {
  id: string;
  exportType: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  fileName?: string | null;
  fileSize?: string | null;
  minioObjectKey?: string | null;
  errorMessage?: string | null;
  httpStatus?: number | null;
  attemptCount?: number;
  failedAt?: string | null;
  rowCount?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
}

function jobBadgeClass(job: PelagicJob): string {
  if (job.status === 'RUNNING' || job.status === 'PENDING') return job.status;
  if (job.status === 'FAILED') return 'FAILED';
  if (job.errorMessage || job.rowCount === 0) return 'WARNING';
  return 'SUCCESS';
}

function formatImportDate(job: PelagicJob): string {
  const value = job.completedAt || job.startedAt || job.createdAt;
  return value ? new Date(value).toLocaleString('fr-FR') : '—';
}

function jobDurationMs(job: PelagicJob): number | null {
  if (!job.startedAt) return null;
  const end = job.completedAt || job.failedAt;
  if (!end) return null;
  const duration = new Date(end).getTime() - new Date(job.startedAt).getTime();
  return duration >= 0 ? duration : null;
}

function formatDuration(duration: number | null): string {
  if (duration == null) return '—';
  if (duration < 60_000) return `${Math.max(1, Math.round(duration / 1000))} s`;
  const minutes = Math.floor(duration / 60_000);
  const seconds = Math.round((duration % 60_000) / 1000);
  return `${minutes} min ${seconds} s`;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<PelagicJob[]>([]);
  const [filters, setFilters] = useState({ status: '', exportType: '', search: '' });
  const [detailJob, setDetailJob] = useState<PelagicJob | null>(null);
  const [mapJob, setMapJob] = useState<PelagicJob | null>(null);
  const [mapPoints, setMapPoints] = useState<VesselTrackPoint[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const insights = useMemo(() => {
    const completed = jobs.filter((job) => job.status === 'SUCCESS' || job.status === 'FAILED');
    const successful = completed.filter((job) => job.status === 'SUCCESS' && !job.errorMessage && job.rowCount !== 0);
    const totalRows = successful.reduce((sum, job) => sum + (job.rowCount || 0), 0);
    const durations = completed.map(jobDurationMs).filter((value): value is number => value != null).sort((a, b) => a - b);
    const medianDuration = durations.length ? durations[Math.floor(durations.length / 2)] : null;
    const pointsJobs = successful.filter((job) => job.exportType === 'points');
    return {
      successRate: completed.length ? Math.round((successful.length / completed.length) * 100) : 0,
      totalRows,
      medianDuration,
      failures: completed.length - successful.length,
      mappableDatasets: pointsJobs.filter((job) => job.minioObjectKey).length,
    };
  }, [jobs]);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.pelagicJobs({
        page: 1,
        pageSize: 50,
        ...(filters.status && { status: filters.status }),
        ...(filters.exportType && { exportType: filters.exportType }),
        ...(filters.search && { search: filters.search }),
      });
      setJobs(res.data.items);
      if (detailJob) {
        const updated = res.data.items.find((job: PelagicJob) => job.id === detailJob.id);
        if (updated) setDetailJob(updated);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const active = jobs.some((j) => {
      if (j.status !== 'RUNNING' && j.status !== 'PENDING') return false;
      if (!j.startedAt) return j.status === 'RUNNING';
      return Date.now() - new Date(j.startedAt).getTime() < 30 * 60 * 1000;
    });
    if (!active) return;
    const timer = window.setInterval(() => { load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [jobs]);

  function openJobDetail(job: PelagicJob) {
    if (job.status === 'FAILED' || job.errorMessage || job.rowCount === 0) {
      setDetailJob(job);
    }
  }

  async function openJobMap(job: PelagicJob) {
    if (!job.minioObjectKey) return;
    setMapJob(job);
    setMapPoints([]);
    setMapError(null);
    setMapLoading(true);
    try {
      const response = await adminApi.pelagicJobMapPreview(job.id);
      setMapPoints(response.data.trackPoints || []);
    } catch (err: any) {
      setMapError(err.response?.data?.error || err.message || 'Chargement de la carte impossible');
    } finally {
      setMapLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Catalogue des acquisitions"
        subtitle="Qualité, rendement et exploration des jeux de données Pelagic"
        actions={<button type="button" className="btn" onClick={load}><RefreshCw size={16} /> Actualiser</button>}
      />
      <div className="jobs-insight-grid fade-in-up">
        <div className="job-insight"><CheckCircle2 size={19} /><div><strong>{insights.successRate}%</strong><span>taux de succès</span></div></div>
        <div className="job-insight"><Database size={19} /><div><strong>{insights.totalRows.toLocaleString('fr-FR')}</strong><span>observations importées</span></div></div>
        <div className="job-insight"><Timer size={19} /><div><strong>{formatDuration(insights.medianDuration)}</strong><span>durée médiane</span></div></div>
        <div className={`job-insight ${insights.failures ? 'warning' : ''}`}><AlertTriangle size={19} /><div><strong>{insights.failures}</strong><span>acquisition(s) à contrôler</span></div></div>
        <div className="job-insight"><MapPinned size={19} /><div><strong>{insights.mappableDatasets}</strong><span>jeux explorables sur carte</span></div></div>
      </div>
      <div className="erp-table-panel card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="filters">
        <input placeholder="Recherche" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Tous statuts</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="FAILED">FAILED</option>
          <option value="RUNNING">RUNNING</option>
          <option value="PENDING">PENDING</option>
        </select>
        <select value={filters.exportType} onChange={(e) => setFilters({ ...filters, exportType: e.target.value })}>
          <option value="">Tous types</option>
          <option value="trips">trips</option>
          <option value="points">points</option>
        </select>
        <button className="btn" onClick={load}>Filtrer</button>
      </div>

      {loading && jobs.length === 0 && (
        <LoadingOverlay message="Chargement de l'historique" />
      )}

      {detailJob && (
        <section className="card job-error-panel">
          <div className="job-error-panel-header">
            <h2>Détail de l&apos;échec — {detailJob.exportType}</h2>
            <button type="button" className="btn sm ghost" onClick={() => setDetailJob(null)}>Fermer</button>
          </div>
          <p><strong>Période :</strong> {detailJob.dateFrom} → {detailJob.dateTo}</p>
          {detailJob.httpStatus != null && <p><strong>HTTP :</strong> {detailJob.httpStatus}</p>}
          {detailJob.attemptCount != null && <p><strong>Tentatives :</strong> {detailJob.attemptCount}</p>}
          {detailJob.failedAt && (
            <p><strong>Échoué le :</strong> {new Date(detailJob.failedAt).toLocaleString('fr-FR')}</p>
          )}
          <p className="job-error-message">
            <strong>Message :</strong>{' '}
            {detailJob.errorMessage || 'Aucun message d\'erreur enregistré'}
          </p>
          {detailJob.status === 'FAILED' && (
            <button
              type="button"
              className="btn sm"
              onClick={async () => {
                const ok = await confirmAction('Relancer l\'import', `Période ${detailJob.dateFrom} → ${detailJob.dateTo}`);
                if (!ok) return;
                try {
                  await withLoading(() => adminApi.pelagicRetry(detailJob.id), 'Relance', 'Nouvelle tentative…');
                  await showSuccess('Relance effectuée');
                  load();
                } catch (err: any) {
                  await showError('Relance échouée', err.response?.data?.error);
                }
              }}
            >
              <RotateCcw size={14} /> Relancer cet import
            </button>
          )}
        </section>
      )}

      {mapJob && (
        <div className="modal-backdrop" role="presentation">
          <section className="map-modal" role="dialog" aria-modal="true" aria-label="Carte des bateaux">
            <div className="map-modal-header">
              <div>
                <h2>Laboratoire des trajectoires</h2>
                <p>{mapJob.fileName || mapJob.minioObjectKey} — {mapJob.dateFrom} → {mapJob.dateTo}</p>
              </div>
              <button
                type="button"
                className="erp-icon-btn modal-close-btn"
                title="Fermer"
                onClick={() => {
                  setMapJob(null);
                  setMapPoints([]);
                  setMapError(null);
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="map-modal-body">
              {mapLoading && <LoadingOverlay message="Préparation de la carte" submessage="Chargement du JSON cartographique optimisé…" />}
              {mapError && <div className="alert">{mapError}</div>}
              {!mapLoading && !mapError && (
                <VesselActivityMap
                  points={mapPoints}
                  loadPointDetails={async (point) => {
                    if (!point.sourceRow || !mapJob) return null;
                    const response = await adminApi.pelagicJobMapRow(mapJob.id, point.sourceRow);
                    return response.data.raw || null;
                  }}
                />
              )}
            </div>
          </section>
        </div>
      )}

      <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Jeu de données</th><th>Fenêtre observée</th><th>Acquis le</th><th>Qualité</th><th>Rendement</th><th>Durée</th><th>Volume</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className={detailJob?.id === job.id ? 'row-selected' : undefined}>
              <td><strong>{job.exportType === 'points' ? 'Positions AIS' : 'Trajets synthétisés'}</strong><small className="table-secondary">{job.fileName || job.id.slice(0, 8)}</small></td>
              <td><strong>{job.dateFrom}</strong><small className="table-secondary">au {job.dateTo}</small></td>
              <td>{formatImportDate(job)}</td>
              <td>
                {job.status === 'FAILED' || job.errorMessage || job.rowCount === 0 ? (
                  <button
                    type="button"
                    className={`badge badge-button ${jobBadgeClass(job)}`}
                    onClick={() => openJobDetail(job)}
                    title="Voir le détail"
                  >
                    {job.status === 'RUNNING' ? 'EN COURS' : jobBadgeClass(job) === 'WARNING' ? 'VIDE' : job.status}
                  </button>
                ) : (
                  <span className={`badge ${job.status}`}>{job.status}</span>
                )}
              </td>
              <td><strong>{job.rowCount?.toLocaleString('fr-FR') ?? '—'}</strong><small className="table-secondary">observations</small></td>
              <td>{formatDuration(jobDurationMs(job))}</td>
              <td>{job.fileSize ? `${(Number(job.fileSize) / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo` : '—'}</td>
              <td className="actions-cell">
                {job.status === 'FAILED' && (
                  <button type="button" className="btn sm" onClick={() => openJobDetail(job)}>Détail</button>
                )}
                {job.status === 'FAILED' && (
                  <button type="button" className="btn sm" onClick={async () => {
                    const ok = await confirmAction('Relancer', `${job.exportType} — ${job.dateFrom}`);
                    if (!ok) return;
                    try {
                      await withLoading(() => adminApi.pelagicRetry(job.id), 'Relance', 'Nouvelle tentative…');
                      await showSuccess('Relance effectuée');
                      load();
                    } catch (err: any) {
                      await showError('Relance échouée', err.response?.data?.error);
                    }
                  }}>
                    <RotateCcw size={14} /> Relancer
                  </button>
                )}
                {job.minioObjectKey && (
                  <button type="button" className="btn sm" onClick={async () => {
                    const r = await adminApi.storageDownload(job.minioObjectKey!);
                    window.open(r.data.url, '_blank');
                  }}><Download size={14} /> Télécharger</button>
                )}
                {job.exportType === 'points' && job.minioObjectKey && job.status === 'SUCCESS' && (
                  <button type="button" className="btn sm" onClick={() => openJobMap(job)}>
                    <MapPinned size={14} /> Analyser
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      </div>
    </div>
  );
}
