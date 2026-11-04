import { useEffect, useMemo, useState } from 'react';
import '../../styles/dailyAutomation.css';
import {
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Play,
  RefreshCw,
  Save,
  AlertTriangle,
  Loader2,
  Database,
  Gauge,
  Globe2,
  History,
  Layers3,
} from 'lucide-react';
import { adminApi } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import LoadingOverlay from '../../components/LoadingOverlay';
import MultiSchedulesPanel from '../../components/MultiSchedulesPanel';
import { confirmAction, showError, showSuccess, withLoading } from '../../lib/swal';

interface MonthSummary {
  year: number;
  month: number;
  key: string;
  label: string;
  dateFrom: string;
  dateTo: string;
  status: 'complete' | 'partial' | 'pending' | 'future' | 'running';
  totalDays: number;
  importedDays: number;
  failedDays: number;
  pendingDays: number;
  lastImportAt: string | null;
  scheduleTime: string;
  scheduleTimezone: string;
  intervalDays: number;
  defaultIntervalDays: number;
  intervalCustomized: boolean;
  canEditInterval: boolean;
  scheduleDescription: string;
}

const INTERVAL_OPTIONS = [1, 7, 15, 30];

interface ScheduleState {
  enabled: boolean;
  time: string;
  timezone: string;
  intervalDays: number;
  description: string;
  nextRunAt?: string | null;
  schedulerActive?: boolean;
  lastAutomaticSyncAt?: string | null;
  lastAutomaticSyncDetails?: string | null;
  lastSyncStatus?: string | null;
  exportTypes?: string[];
  pointsEnabled?: boolean;
  runningJobs?: number;
  recentCronJobs?: Array<{
    id: string;
    exportType: string;
    status: string;
    dateFrom: string;
    dateTo: string;
    errorMessage?: string | null;
    rowCount?: number | null;
    startedAt?: string | null;
    completedAt?: string | null;
    failedAt?: string | null;
  }>;
  recentCronEvents?: Array<{
    id: string;
    action: string;
    details?: string | null;
    createdAt: string;
  }>;
}

const TIMEZONES = ['Africa/Casablanca', 'UTC', 'Europe/Paris'];

function statusMeta(status: MonthSummary['status']) {
  switch (status) {
    case 'complete':
      return { label: 'Complet', icon: CheckCircle2, className: 'status-complete' };
    case 'partial':
      return { label: 'Partiel', icon: AlertTriangle, className: 'status-partial' };
    case 'running':
      return { label: 'En cours', icon: Loader2, className: 'status-running' };
    case 'future':
      return { label: 'À venir', icon: Clock3, className: 'status-future' };
    default:
      return { label: 'En attente', icon: CircleDashed, className: 'status-pending' };
  }
}

export default function PlanningPage() {
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<MonthSummary[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [schedule, setSchedule] = useState<ScheduleState>({
    enabled: true,
    time: '01:00',
    timezone: 'Africa/Casablanca',
    intervalDays: 1,
    description: '',
  });
  const [draft, setDraft] = useState<ScheduleState | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [savingIntervalKey, setSavingIntervalKey] = useState<string | null>(null);
  const [bulkInterval, setBulkInterval] = useState(7);

  async function load() {
    setLoading(true);
    try {
      const [monthsRes, scheduleRes] = await Promise.all([
        adminApi.pelagicMonths(),
        adminApi.pelagicSchedule(),
      ]);
      setMonths(monthsRes.data.months);
      setYears(monthsRes.data.years);
      const s = scheduleRes.data;
      const nextSchedule = {
        enabled: s.enabled,
        time: s.time,
        timezone: s.timezone,
        intervalDays: s.intervalDays,
        description: s.description,
        nextRunAt: s.scheduler?.nextRunAt ?? null,
        schedulerActive: s.scheduler?.active ?? false,
        lastAutomaticSyncAt: s.lastAutomaticSync?.at ?? null,
        lastAutomaticSyncDetails: s.lastAutomaticSync?.details ?? null,
        lastSyncStatus: s.lastSyncStatus ?? null,
        exportTypes: s.exportTypes ?? ['trips'],
        pointsEnabled: s.pointsEnabled ?? false,
        runningJobs: s.runningJobs ?? 0,
        recentCronJobs: s.recentCronJobs ?? [],
        recentCronEvents: s.recentCronEvents ?? [],
      };
      setSchedule(nextSchedule);
      setDraft(nextSchedule);
      if (selectedYear === 'all' && monthsRes.data.years.length) {
        setSelectedYear(monthsRes.data.years[monthsRes.data.years.length - 1]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const active = schedule.runningJobs && schedule.runningJobs > 0;
    if (!active) return;
    const timer = window.setInterval(() => { load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [schedule.runningJobs]);

  const filteredMonths = useMemo(() => {
    if (selectedYear === 'all') return months;
    return months.filter((month) => month.year === selectedYear);
  }, [months, selectedYear]);

  const stats = useMemo(() => {
    const eligible = filteredMonths.filter((month) => month.status !== 'future');
    const coveredDays = eligible.reduce((sum, month) => sum + month.importedDays, 0);
    const expectedDays = eligible.reduce((sum, month) => sum + month.totalDays, 0);
    const failedDays = eligible.reduce((sum, month) => sum + month.failedDays, 0);
    const missingDays = eligible.reduce((sum, month) => sum + month.pendingDays, 0);
    return {
      coverage: expectedDays ? Math.round((coveredDays / expectedDays) * 100) : 0,
      coveredDays,
      expectedDays,
      failedDays,
      missingDays,
      complete: eligible.filter((month) => month.status === 'complete').length,
    };
  }, [filteredMonths]);

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const ok = await confirmAction(
      'Enregistrer la planification',
      `Import automatique chaque nuit à ${draft.time} (${draft.timezone}) pour la veille.`
    );
    if (!ok) return;

    try {
      await withLoading(
        () => adminApi.pelagicUpdateSchedule({
          enabled: draft.enabled,
          time: draft.time,
          timezone: draft.timezone,
          intervalDays: draft.intervalDays,
        }),
        'Enregistrement',
        'Mise à jour du planificateur…'
      );
      await showSuccess('Planification enregistrée', draft.description || undefined);
      load();
    } catch (err: any) {
      await showError('Échec', err.response?.data?.error || 'Impossible d\'enregistrer');
    }
  }

  async function updateMonthInterval(month: MonthSummary, intervalDays: number) {
    if (!month.canEditInterval || month.intervalDays === intervalDays) return;

    setSavingIntervalKey(month.key);
    try {
      await adminApi.pelagicUpdateMonthPlan(month.year, month.month, intervalDays);
      setMonths((prev) =>
        prev.map((item) =>
          item.key === month.key
            ? { ...item, intervalDays, intervalCustomized: true }
            : item
        )
      );
    } catch (err: any) {
      await showError('Enregistrement impossible', err.response?.data?.error);
    } finally {
      setSavingIntervalKey(null);
    }
  }

  async function applyBulkInterval() {
    const targets = filteredMonths.filter((m) => m.canEditInterval);
    if (targets.length === 0) {
      await showError('Aucun mois', 'Aucun mois non importé à mettre à jour pour cette sélection.');
      return;
    }

    const ok = await confirmAction(
      'Appliquer l\'intervalle',
      `Définir ${bulkInterval} jour(s) pour ${targets.length} mois non importés ?`
    );
    if (!ok) return;

    try {
      await withLoading(async () => {
        for (const month of targets) {
          await adminApi.pelagicUpdateMonthPlan(month.year, month.month, bulkInterval);
        }
      }, 'Enregistrement', 'Mise à jour des intervalles mensuels…');
      await showSuccess('Intervalles enregistrés', `${targets.length} mois mis à jour.`);
      load();
    } catch (err: any) {
      await showError('Échec', err.response?.data?.error || 'Mise à jour impossible');
    }
  }

  async function importMonth(month: MonthSummary) {
    if (month.status === 'complete' || month.status === 'future' || month.status === 'running') return;
    const ok = await confirmAction(
      `Compléter ${month.label}`,
      `Importer uniquement les périodes manquantes jusqu’au ${month.dateTo}. Les données déjà présentes seront conservées.`
    );
    if (!ok) return;

    setImportingKey(month.key);
    try {
      const response = await withLoading(
        () => adminApi.pelagicImportMonth(month.year, month.month, { intervalDays: month.intervalDays }),
        'Import en cours',
        `Téléchargement des données ${month.label}…`
      );
      if (response.data.failures?.length) {
        await showError('Rattrapage partiel', `${response.data.failures.length} période(s) en échec. Le tableau sera actualisé.`);
      } else {
        await showSuccess('Rattrapage terminé', response.data.message || `${month.label} complété.`);
      }
      load();
    } catch (err: any) {
      await showError('Import échoué', err.response?.data?.error || 'Erreur lors de l\'import');
    } finally {
      setImportingKey(null);
    }
  }

  if (loading && months.length === 0) {
    return <LoadingOverlay message="Chargement de la planification" submessage="Préparation du calendrier mensuel…" />;
  }

  return (
    <div className="planning-page">
      <PageHeader
        title="Planification & imports"
        subtitle="Programmez l'import automatique nocturne et suivez l'état mensuel depuis 2020"
        actions={(
          <button type="button" className="btn" onClick={load}>
            <RefreshCw size={16} /> Actualiser
          </button>
        )}
      />

      <MultiSchedulesPanel />

      <section className="card schedule-card fade-in-up">
        <div className="daily-automation">
          <header className="daily-automation-header">
            <div className="daily-automation-title">
              <span className="daily-automation-emblem"><CalendarClock size={23} /></span>
              <div><span className="daily-automation-eyebrow">SYNCHRONISATION PELAGIC</span>
                <h2>Import automatique quotidien</h2>
                <p>Planifiez la collecte de vos trajets et points GPS.</p>
              </div>
            </div>
            <span className={`daily-automation-badge ${schedule.schedulerActive ? 'active' : 'inactive'}`}>
              <span />{schedule.schedulerActive ? 'Planificateur actif' : 'Planificateur inactif'}
            </span>
          </header>

          {draft && <form className="daily-automation-form" onSubmit={saveSchedule}>
            <div className={`daily-automation-enable ${draft.enabled ? 'enabled' : ''}`}>
              <label className="daily-automation-switch-label">
                <input type="checkbox" role="switch" checked={draft.enabled}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                <span className="daily-automation-switch" aria-hidden="true" />
                <span><strong>Activer l’import automatique</strong><small>Exécuter les imports selon les réglages ci-dessous.</small></span>
              </label>
              <span className="daily-automation-enable-state">{draft.enabled ? 'Activé' : 'Désactivé'}</span>
            </div>
            <div className="daily-automation-fields">
              <label><span><Clock3 size={15} /> Heure d’exécution</span>
                <input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} required />
                <small>Heure locale du fuseau choisi</small>
              </label>
              <label><span><Globe2 size={15} /> Fuseau horaire</span>
                <select value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select><small>Référence pour la planification</small>
              </label>
              <label><span><Layers3 size={15} /> Intervalle (jours)</span>
                <select value={draft.intervalDays} onChange={(e) => setDraft({ ...draft, intervalDays: Number(e.target.value) })}>
                  {INTERVAL_OPTIONS.map(n => <option key={n} value={n}>{n} {n === 1 ? 'jour' : 'jours'}</option>)}
                </select><small>Intervalle des imports</small>
              </label>
            </div>
            <div className="daily-automation-footer">
              <div className="daily-automation-recap"><Clock3 size={18} /><div>
                <strong>{draft.enabled ? `Chaque jour à ${draft.time}` : 'Import automatique désactivé'}</strong>
                <span>{draft.timezone} · {draft.enabled !== schedule.enabled || draft.time !== schedule.time || draft.timezone !== schedule.timezone || draft.intervalDays !== schedule.intervalDays ? 'Modifications à enregistrer' : 'Configuration enregistrée'}</span>
              </div></div>
              <button type="submit" className="btn primary daily-automation-save"><Save size={17} /> Enregistrer la planification</button>
            </div>
          </form>}

          <div className="daily-automation-status" aria-label="État de la planification enregistrée">
            <div className="daily-automation-stat">
              <span className={`daily-automation-stat-icon ${schedule.schedulerActive ? 'active' : ''}`}><CheckCircle2 size={19} /></span>
              <div><span>Planificateur</span><strong className={schedule.schedulerActive ? 'daily-automation-ok' : ''}>{schedule.schedulerActive ? 'Opérationnel' : 'Inactif'}</strong><small>{schedule.enabled ? 'Import automatique activé' : 'Import automatique désactivé'}</small></div>
            </div>
            <div className="daily-automation-stat">
              <span className="daily-automation-stat-icon"><CalendarClock size={19} /></span>
              <div><span>Prochaine exécution</span><strong>{schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleDateString('fr-FR', { timeZone: schedule.timezone, day: '2-digit', month: 'long', year: 'numeric' }) : 'Non programmée'}</strong><small>{schedule.nextRunAt ? `À ${new Date(schedule.nextRunAt).toLocaleTimeString('fr-FR', { timeZone: schedule.timezone, hour: '2-digit', minute: '2-digit' })} · ${schedule.timezone}` : 'Activez et enregistrez la planification'}</small></div>
            </div>
            <div className="daily-automation-stat">
              <span className="daily-automation-stat-icon"><History size={19} /></span>
              <div><span>Dernier import automatique</span><strong>{schedule.lastAutomaticSyncAt ? new Date(schedule.lastAutomaticSyncAt).toLocaleDateString('fr-FR', { timeZone: schedule.timezone, day: '2-digit', month: 'long', year: 'numeric' }) : 'Aucune exécution'}</strong><small>{schedule.lastAutomaticSyncAt ? `À ${new Date(schedule.lastAutomaticSyncAt).toLocaleTimeString('fr-FR', { timeZone: schedule.timezone, hour: '2-digit', minute: '2-digit' })} · déclenché par le cron` : 'L’historique apparaîtra après le premier import'}</small></div>
            </div>
          </div>
        </div>
        {!schedule.schedulerActive && (
          <p className="alert">
            Le planificateur n&apos;est pas actif. Vérifiez que la case « Activer l&apos;import automatique » est cochée,
            puis enregistrez. Redémarrez l&apos;API si besoin : <code>docker compose restart api</code>.
          </p>
        )}

        <div className="import-execution-panel">
          <div className="import-execution-header">
            <h3>Exécution des imports</h3>
            {schedule.runningJobs && schedule.runningJobs > 0 ? (
              <span className="import-live-badge"><Loader2 size={14} className="spin" /> En cours…</span>
            ) : schedule.lastSyncStatus ? (
              <span className={`import-status-pill ${schedule.lastSyncStatus.toLowerCase()}`}>
                Dernier cycle : {schedule.lastSyncStatus}
              </span>
            ) : (
              <span className="import-status-pill pending">Aucun import auto encore</span>
            )}
          </div>
          <p className="import-types-hint">
            <strong>Types actifs :</strong>{' '}
            {(schedule.exportTypes ?? ['trips']).join(', ')}
            {!schedule.pointsEnabled && (
              <span className="import-types-note">
                {' '}— <code>points</code> désactivé (<code>PELAGIC_SYNC_EXPORT_TYPES=trips</code>) et API Pelagic points en erreur HTTP 500
              </span>
            )}
          </p>
          {(schedule.recentCronJobs?.length ?? 0) > 0 && (
            <div className="table-wrap">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Type</th><th>Période</th><th>Statut</th><th>Lignes</th><th>Message</th><th>Terminé</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.recentCronJobs!.map((job) => (
                    <tr key={job.id}>
                      <td>{job.exportType}</td>
                      <td>{job.dateFrom}</td>
                      <td><span className={`badge ${job.status}`}>{job.status}</span></td>
                      <td>{job.rowCount ?? '—'}</td>
                      <td className="import-job-message">{job.errorMessage || '—'}</td>
                      <td>
                        {job.completedAt
                          ? new Date(job.completedAt).toLocaleString('fr-FR', { timeZone: schedule.timezone })
                          : job.failedAt
                            ? new Date(job.failedAt).toLocaleString('fr-FR', { timeZone: schedule.timezone })
                            : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(schedule.recentCronEvents?.length ?? 0) > 0 && (
            <div className="cron-events-panel">
              <h4>Trace des exécutions planifiées</h4>
              <div className="table-wrap">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Date</th><th>Événement</th><th>Détail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.recentCronEvents!.map((event) => (
                      <tr key={event.id}>
                        <td>{new Date(event.createdAt).toLocaleString('fr-FR', { timeZone: schedule.timezone })}</td>
                        <td><span className={`badge ${event.action.includes('FAILED') ? 'FAILED' : event.action.includes('SKIPPED') ? 'WARNING' : 'SUCCESS'}`}>{event.action.replace('PELAGIC_DAILY_SYNC_', '').replace('PELAGIC_DAILY_SYNC', 'SUCCESS')}</span></td>
                        <td>{event.details || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="planning-stats fade-in-up">
        <div className="mini-stat success">
          <Gauge size={18} />
          <span><strong>{stats.coverage}%</strong> de couverture temporelle</span>
        </div>
        <div className="mini-stat">
          <Database size={18} />
          <span><strong>{stats.coveredDays.toLocaleString('fr-FR')}</strong> / {stats.expectedDays.toLocaleString('fr-FR')} jours disponibles</span>
        </div>
        <div className={`mini-stat ${stats.failedDays ? 'danger' : 'success'}`}>
          <AlertTriangle size={18} />
          <span><strong>{stats.failedDays}</strong> jours en erreur</span>
        </div>
        <div className={`mini-stat ${stats.missingDays ? 'warning' : 'success'}`}>
          <CircleDashed size={18} />
          <span><strong>{stats.missingDays}</strong> jours à acquérir</span>
        </div>
      </div>

      <section className="card months-card fade-in-up">
        <div className="months-toolbar">
          <div>
            <h2>Couverture temporelle des données</h2>
            <p className="section-subtitle">Couverture des imports échus, vérifiée dans les fichiers et manifestes MinIO. Trajets et points GPS sont requis pour chaque journée.</p>
          </div>
          <div className="months-toolbar-actions">
            <label className="bulk-interval-label">
              Intervalle mois non importés
              <select value={bulkInterval} onChange={(e) => setBulkInterval(Number(e.target.value))}>
                {INTERVAL_OPTIONS.map((n) => <option key={n} value={n}>{n} j</option>)}
              </select>
            </label>
            <button type="button" className="btn sm" onClick={applyBulkInterval}>
              <Save size={14} /> Appliquer à la sélection
            </button>
            <select value={String(selectedYear)} onChange={(e) => setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">Toutes les années</option>
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
        </div>

        <p className="section-subtitle">
          Une journée correspond à une période complète de minuit à minuit ou de {schedule.time} à {schedule.time} le lendemain ({schedule.timezone}).
          Les périodes du cron sont rattachées à leur date de début. La période en cours n’est pas comptée comme manquante.
          Cette couverture décrit les périodes exportées ; elle ne garantit pas la continuité de chaque capteur GPS.
        </p>
        <div className="erp-table-panel" style={{ border: '1px solid var(--erp-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table months-table">
            <thead>
              <tr>
                <th>Mois</th>
                <th>Couverture</th>
                <th>Lacunes</th>
                <th>Pas d'acquisition</th>
                <th>Statut</th>
                <th>Dernier import</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMonths.map((month) => {
                const meta = statusMeta(month.status);
                const Icon = meta.icon;
                const progress = month.totalDays
                  ? Math.round((month.importedDays / month.totalDays) * 100)
                  : 0;

                return (
                  <tr key={month.key} className={meta.className}>
                    <td>
                      <div className="month-cell">
                        <Icon size={18} className={month.status === 'running' ? 'spin' : undefined} />
                        <div>
                          <strong>{month.label}</strong>
                          <small>{month.dateFrom} → {month.dateTo}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="progress-cell">
                        <div className="coverage-heading"><strong>{progress}%</strong><small>{month.importedDays}/{month.totalDays} jours</small></div>
                        <div className="progress-bar" aria-label={`Couverture ${progress}%`}>
                          <div className="progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="gap-counts">
                        <span className={month.pendingDays ? 'warning' : 'muted'}>{month.pendingDays} manquant(s)</span>
                        <span className={month.failedDays ? 'danger' : 'muted'}>{month.failedDays} erreur(s)</span>
                      </div>
                    </td>
                    <td>
                      {month.canEditInterval ? (
                        <div className="interval-editor">
                          <select
                            className="interval-select"
                            value={month.intervalDays}
                            disabled={savingIntervalKey === month.key || month.status === 'running'}
                            onChange={(e) => updateMonthInterval(month, Number(e.target.value))}
                          >
                            {INTERVAL_OPTIONS.map((n) => (
                              <option key={n} value={n}>{n} j</option>
                            ))}
                          </select>
                          {month.intervalCustomized && (
                            <small className="interval-custom">personnalisé</small>
                          )}
                          {savingIntervalKey === month.key && (
                            <Loader2 className="spin" size={12} />
                          )}
                        </div>
                      ) : (
                        <span>{month.intervalDays} j</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${meta.className}`}>{meta.label}</span>
                    </td>
                    <td>
                      {month.lastImportAt
                        ? new Date(month.lastImportAt).toLocaleString('fr-FR')
                        : '—'}
                    </td>
                    <td className="actions-cell">
                      {month.status !== 'future' && month.status !== 'complete' && (
                        <button
                          type="button"
                          className="btn sm primary"
                          disabled={importingKey === month.key || month.status === 'running'}
                          onClick={() => importMonth(month)}
                        >
                          {importingKey === month.key ? <Loader2 className="spin" size={14} /> : <Play size={14} />}
                          Compléter
                        </button>
                      )}
                      {month.status === 'complete' && (
                        <span className="icon-action ok" title="À jour : toutes les périodes échues sont importées">
                          <CheckCircle2 size={14} /> À jour
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      </section>
    </div>
  );
}
