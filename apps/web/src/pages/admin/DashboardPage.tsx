import { useEffect, useState } from 'react';
import { Database, Radio, RefreshCw, CheckCircle2, AlertTriangle, CalendarClock, MapPinned, ShipWheel, Activity } from 'lucide-react';
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
    <div className="scientific-dashboard">
      <PageHeader
        title="Tableau de bord"
        subtitle="Couverture, acquisitions et état opérationnel des données PDS"
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

      <div className="science-kpi-grid fade-in-up">
        <div className="science-kpi"><MapPinned size={19} /><div><strong>{Number(data.science.pointRows).toLocaleString('fr-FR')}</strong><span>positions référencées</span><small>Source : imports points réussis</small></div></div>
        <div className="science-kpi"><ShipWheel size={19} /><div><strong>{Number(data.science.tripRows).toLocaleString('fr-FR')}</strong><span>voyages référencés</span><small>Source : imports trips réussis</small></div></div>
        <div className="science-kpi"><CheckCircle2 size={19} /><div><strong>{data.jobs.successRate}%</strong><span>taux de succès</span><small>{data.jobs.total} traitements observés</small></div></div>
        <div className="science-kpi"><CalendarClock size={19} /><div><strong>{data.science.activeSchedules}</strong><span>planifications actives</span><small>Source : registre PDS</small></div></div>
        <div className="science-kpi"><Activity size={19} /><div><strong>{data.science.temporalStart || '—'}</strong><span>début de couverture</span><small>Fin : {data.science.temporalEnd || '—'}</small></div></div>
      </div>

      <div className="dashboard-analysis-grid fade-in-up">
        <section className="dashboard-panel">
          <div className="section-head"><h2>Activité des acquisitions sur 12 mois</h2><span className="hint">Lignes validées</span></div>
          <div className="activity-chart" role="img" aria-label="Volume mensuel des observations importées">
            {data.monthlyActivity.map((item: any) => {
              const max = Math.max(1, ...data.monthlyActivity.map((entry: any) => entry.rows));
              return <div className="activity-column" key={item.month} title={`${item.month}: ${item.rows.toLocaleString('fr-FR')} lignes`}>
                <div className="activity-bar-wrap"><div className="activity-bar" style={{ height: `${Math.max(3, item.rows / max * 100)}%` }} /></div>
                <strong>{item.rows.toLocaleString('fr-FR')}</strong><span>{item.month.slice(5)}</span>
              </div>;
            })}
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="section-head"><h2>Occupation du stockage</h2><span className="hint">{(data.minio.totalSizeBytes / 1024 ** 3).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go</span></div>
          <div className="storage-breakdown">
            {data.storageByType.map((item: any) => <div key={item.type}>
              <div className="storage-breakdown-head"><strong>{item.type}</strong><span>{item.files} fichiers · {(item.bytes / 1024 ** 2).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo</span></div>
              <div className="storage-breakdown-track"><i style={{ width: `${data.minio.totalSizeBytes ? item.bytes / data.minio.totalSizeBytes * 100 : 0}%` }} /></div>
            </div>)}
          </div>
        </section>
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
