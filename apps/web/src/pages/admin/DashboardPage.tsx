import { useEffect, useState } from 'react';
import { Database, Radio, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { adminApi } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import LoadingOverlay from '../../components/LoadingOverlay';
import { confirmAction, showError, showSuccess, withLoading } from '../../lib/swal';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.dashboard();
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function runTest(type: 'minio' | 'pelagic') {
    try {
      await withLoading(
        () => (type === 'minio' ? adminApi.storageTest() : adminApi.pelagicTest()),
        'Test en cours',
        type === 'minio' ? 'Vérification MinIO…' : 'Vérification Pelagic…'
      );
      await showSuccess('Test réussi', type === 'minio' ? 'MinIO opérationnel' : 'Pelagic accessible');
      load();
    } catch (err: any) {
      await showError('Test échoué', err.response?.data?.message || err.response?.data?.error);
    }
  }

  async function syncNow() {
    const ok = await confirmAction('Lancer la synchronisation', 'Importer la journée de la veille maintenant ?');
    if (!ok) return;
    try {
      await withLoading(() => adminApi.pelagicSyncNow(), 'Synchronisation', 'Import en cours…');
      await showSuccess('Synchronisation terminée');
      load();
    } catch (err: any) {
      await showError('Synchronisation échouée', err.response?.data?.error);
    }
  }

  if (loading) return <LoadingOverlay message="Chargement du tableau de bord" />;
  if (!data) return <p>Dashboard indisponible</p>;

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        subtitle="État MinIO, Pelagic et synchronisations"
        actions={(
          <>
            <button type="button" className="btn" onClick={() => runTest('minio')}>Tester MinIO</button>
            <button type="button" className="btn" onClick={() => runTest('pelagic')}>Tester Pelagic</button>
            <button type="button" className="btn primary" onClick={syncNow}>Sync maintenant</button>
            <a className="btn" href={data.minio.consoleUrl} target="_blank" rel="noreferrer">Console MinIO</a>
          </>
        )}
      />

      <div className="grid cards">
        <StatCard
          icon={<Database size={20} />}
          label="MinIO"
          value={data.minio.connected ? 'Connecté' : 'Indisponible'}
          hint={`${data.minio.objectCount} fichiers — ${(data.minio.totalSizeBytes / 1024 / 1024).toFixed(1)} Mo`}
          tone={data.minio.connected ? 'success' : 'danger'}
        />
        <StatCard
          icon={<Radio size={20} />}
          label="Pelagic API"
          value={data.pelagic.configured ? 'Configurée' : 'Non configurée'}
          tone={data.pelagic.configured ? 'success' : 'warning'}
        />
        <StatCard
          icon={<RefreshCw size={20} />}
          label="Sync auto"
          value={data.sync.enabled ? 'Activée' : 'Désactivée'}
          hint={`${data.sync.cron} (${data.sync.timezone})`}
        />
        <StatCard
          icon={data.jobs.failed > 0 ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
          label="Jobs"
          value={`${data.jobs.success} réussis / ${data.jobs.failed} erreurs`}
          hint={`Dernier trips: ${data.jobs.lastTripsExportAt ? new Date(data.jobs.lastTripsExportAt).toLocaleString('fr-FR') : '—'}`}
          tone={data.jobs.failed > 0 ? 'warning' : 'success'}
        />
      </div>

      {(data.alerts.minioDown || data.alerts.pelagicDown || data.alerts.staleSync) && (
        <div className="alert fade-in-up">
          <strong>Alertes :</strong>{' '}
          {data.alerts.minioDown && 'MinIO indisponible. '}
          {data.alerts.pelagicDown && 'Pelagic non configurée. '}
          {data.alerts.staleSync && 'Pas de sync depuis > 48h. '}
        </div>
      )}
    </div>
  );
}
