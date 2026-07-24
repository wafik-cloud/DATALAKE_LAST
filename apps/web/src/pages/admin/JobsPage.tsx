import { useEffect, useState } from 'react';
import { RefreshCw, Download, RotateCcw } from 'lucide-react';
import { adminApi } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import LoadingOverlay from '../../components/LoadingOverlay';
import { confirmAction, showError, showSuccess, withLoading } from '../../lib/swal';

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
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<PelagicJob[]>([]);
  const [filters, setFilters] = useState({ status: '', exportType: '', search: '' });
  const [detailJob, setDetailJob] = useState<PelagicJob | null>(null);

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

  function openJobDetail(job: PelagicJob) {
    if (job.status === 'FAILED' || job.errorMessage) {
      setDetailJob(job);
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

      <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Type</th><th>Période</th><th>Statut</th><th>Fichier</th><th>Taille</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className={detailJob?.id === job.id ? 'row-selected' : undefined}>
              <td>{job.exportType}</td>
              <td>{job.dateFrom} → {job.dateTo}</td>
              <td>
                {job.status === 'FAILED' || job.errorMessage ? (
                  <button
                    type="button"
                    className={`badge badge-button ${job.status}`}
                    onClick={() => openJobDetail(job)}
                    title="Voir le détail de l'erreur"
                  >
                    {job.status}
                  </button>
                ) : (
                  <span className={`badge ${job.status}`}>{job.status}</span>
                )}
              </td>
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
