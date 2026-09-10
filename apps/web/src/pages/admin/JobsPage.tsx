import { useEffect, useState } from 'react';
import { RefreshCw, Download, RotateCcw, MapPinned, X } from 'lucide-react';
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

export default function JobsPage() {
  const [jobs, setJobs] = useState<PelagicJob[]>([]);
  const [filters, setFilters] = useState({ status: '', exportType: '', search: '' });
  const [detailJob, setDetailJob] = useState<PelagicJob | null>(null);
  const [mapJob, setMapJob] = useState<PelagicJob | null>(null);
  const [mapPoints, setMapPoints] = useState<VesselTrackPoint[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

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
        title="Historique détaillé"
        subtitle="Suivi granulaire des traitements d'import"
        actions={<button type="button" className="btn" onClick={load}><RefreshCw size={16} /> Actualiser</button>}
      />
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
                <h2>Carte des bateaux</h2>
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
            <th>Type</th><th>Période</th><th>Date import</th><th>Statut</th><th>Lignes</th><th>Fichier</th><th>Taille</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className={detailJob?.id === job.id ? 'row-selected' : undefined}>
              <td>{job.exportType}</td>
              <td>{job.dateFrom} → {job.dateTo}</td>
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
              <td>{job.rowCount ?? '—'}</td>
              <td>{job.fileName || '—'}</td>
              <td>{job.fileSize ? `${(Number(job.fileSize) / 1024).toFixed(1)} Ko` : '—'}</td>
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
                    <MapPinned size={14} /> Carte
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
