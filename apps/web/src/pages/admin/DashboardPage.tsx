import '../../styles/dashboard.css';
import { Can } from '../../lib/auth';
import { useEffect, useState } from 'react';
import { Database, Radio, RefreshCw, CheckCircle2, AlertTriangle, CalendarClock, MapPinned, ShipWheel, Activity, ExternalLink, ArrowUpRight, BarChart3, HardDrive } from 'lucide-react';
import { adminApi } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import LoadingOverlay from '../../components/LoadingOverlay';
import { confirmAction, showError, showSuccess, withLoading } from '../../lib/swal';

const compactNumber = (value: number) => new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const storageSize = (bytes: number) => {
  const unit = bytes >= 1024 ** 3 ? 'Go' : bytes >= 1024 ** 2 ? 'Mo' : 'Ko';
  const divisor = unit === 'Go' ? 1024 ** 3 : unit === 'Mo' ? 1024 ** 2 : 1024;
  return `${(bytes / divisor).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${unit}`;
};
const displayDate = (value?: string) => value ? new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
const storageLabels: Record<string, string> = { points: 'Positions GPS', trips: 'Trajets', previews: 'Aperçus de cartes', manifests: 'Manifestes', errors: 'Rapports d’erreur' };

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

  const maxActivity = Math.max(1, ...data.monthlyActivity.map((item: any) => Number(item.rows)));
  const totalActivity = data.monthlyActivity.reduce((sum: number, item: any) => sum + Number(item.rows), 0);

  return (
    <div className="scientific-dashboard">
      <PageHeader
        title="Tableau de bord"
        subtitle="Couverture, acquisitions et état opérationnel des données PDS"
        actions={(
          <>
            <Can permission="settings.manage"><button type="button" className="btn" onClick={() => runTest('minio')}>Tester MinIO</button></Can>
            <Can permission="settings.manage"><button type="button" className="btn" onClick={() => runTest('pelagic')}>Tester Pelagic</button></Can>
            <Can permission="imports.run"><button type="button" className="btn primary" onClick={syncNow}><RefreshCw size={14} /> Synchroniser</button></Can>
            <a className="btn" href={data.minio.consoleUrl} target="_blank" rel="noreferrer">Console MinIO <ExternalLink size={13} /></a>
          </>
        )}
      />

      <div className="dashboard-services grid cards" aria-label="État des services">
        <StatCard
          icon={<Database size={20} />}
          label="MinIO"
          value={data.minio.connected ? 'Connecté' : 'Indisponible'}
          hint={`${Number(data.minio.objectCount).toLocaleString('fr-FR')} fichiers · ${storageSize(data.minio.totalSizeBytes)}`}
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
          label="Traitements"
          value={`${data.jobs.success} réussis`}
          hint={`${data.jobs.failed} erreur(s) · ${data.jobs.running} en cours · Dernier trajet : ${data.jobs.lastTripsExportAt ? new Date(data.jobs.lastTripsExportAt).toLocaleString('fr-FR', { timeZone: data.sync.timezone }) : '—'}`}
          tone={data.jobs.failed > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="science-kpi-grid fade-in-up">
        <div className="science-kpi"><MapPinned size={19} /><div><strong>{Number(data.science.pointRows).toLocaleString('fr-FR')}</strong><span>positions référencées</span><small>Source : imports points réussis</small></div></div>
        <div className="science-kpi"><ShipWheel size={19} /><div><strong>{Number(data.science.tripRows).toLocaleString('fr-FR')}</strong><span>voyages référencés</span><small>Source : imports trips réussis</small></div></div>
        <div className="science-kpi"><CheckCircle2 size={19} /><div><strong>{data.jobs.successRate}%</strong><span>taux de succès</span><small>{data.jobs.total} traitements observés</small></div></div>
        <div className="science-kpi"><CalendarClock size={19} /><div><strong>{data.science.activeSchedules}</strong><span>planifications actives</span><small>Source : registre PDS</small></div></div>
        <div className="science-kpi"><Activity size={19} /><div><strong className="dashboard-date">{displayDate(data.science.temporalStart)}</strong><span>début de couverture</span><small>Fin : {displayDate(data.science.temporalEnd)}</small></div></div>
      </div>

      <div className="dashboard-analysis-grid fade-in-up">
        <section className="dashboard-panel">
          <div className="section-head dashboard-panel-heading">
            <div><span className="dashboard-eyebrow"><BarChart3 size={13} /> ACQUISITIONS</span><h2>Volume des observations</h2><p>Les 12 derniers mois d’activité enregistrés</p></div>
            <div className="dashboard-panel-total"><strong>{compactNumber(totalActivity)}</strong><span>lignes importées</span></div>
          </div>
          {data.monthlyActivity.length ? <div className="dashboard-chart-body">
            <div className="dashboard-chart-axis" aria-hidden="true"><span>{compactNumber(maxActivity)}</span><span>{compactNumber(maxActivity / 2)}</span><span>0</span></div>
            <div className="activity-chart" role="img" aria-label="Volume mensuel des observations importées">
              {data.monthlyActivity.map((item: any) => {
                const monthLabel = new Date(`${item.month}-01T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
                return <div className="activity-column" key={item.month} title={`${monthLabel} : ${Number(item.rows).toLocaleString('fr-FR')} lignes`}>
                  <div className="activity-bar-wrap"><div className="activity-bar" style={{ height: `${Math.max(0, Number(item.rows)) / maxActivity * 100}%` }} /></div>
                  <strong>{compactNumber(Number(item.rows))}</strong><span>{monthLabel}</span>
                </div>;
              })}
            </div>
          </div> : <p className="dashboard-empty">Les acquisitions apparaîtront après le premier import.</p>}
          <div className="dashboard-panel-foot"><span><i /> Observations importées</span><a href="/admin/planning">Voir la planification <ArrowUpRight size={13} /></a></div>
        </section>

        <section className="dashboard-panel">
          <div className="section-head dashboard-panel-heading">
            <div><span className="dashboard-eyebrow"><HardDrive size={13} /> MINIO</span><h2>Répartition des fichiers</h2><p>Volume des objets stockés par catégorie</p></div>
            <div className="dashboard-panel-total"><strong>{storageSize(data.minio.totalSizeBytes)}</strong><span>stockés dans MinIO</span></div>
          </div>
          <div className="storage-breakdown">
            {data.storageByType.map((item: any) => {
              const share = data.minio.totalSizeBytes ? item.bytes / data.minio.totalSizeBytes * 100 : 0;
              return <div className={`dashboard-storage-row storage-${item.type}`} key={item.type}>
                <div className="storage-breakdown-head"><strong><i />{storageLabels[item.type] || item.type}</strong><span>{storageSize(item.bytes)}</span></div>
                <div className="storage-breakdown-track"><i style={{ width: `${share}%` }} /></div>
                <div className="dashboard-storage-meta"><span>{Number(item.files).toLocaleString('fr-FR')} fichiers</span><span>{share.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % du volume</span></div>
              </div>;
            })}
          </div>
          <div className="dashboard-panel-foot"><span>Fichiers et aperçus</span><a href="/admin/files">Explorer les fichiers <ArrowUpRight size={13} /></a></div>
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
