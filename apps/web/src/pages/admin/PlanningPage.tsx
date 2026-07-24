import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Download,
  Play,
  RefreshCw,
  Save,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { adminApi } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import LoadingOverlay from '../../components/LoadingOverlay';
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

  const filteredMonths = useMemo(() => {
    if (selectedYear === 'all') return months;
    return months.filter((month) => month.year === selectedYear);
  }, [months, selectedYear]);

  const stats = useMemo(() => ({
    complete: months.filter((m) => m.status === 'complete').length,
    pending: months.filter((m) => m.status === 'pending' || m.status === 'partial').length,
    total: months.filter((m) => m.status !== 'future').length,
  }), [months]);

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
    const ok = await confirmAction(
      `Importer ${month.label}`,
      `Période ${month.dateFrom} → ${month.dateTo} (intervalle ${month.intervalDays} jour(s))`
    );
    if (!ok) return;

    setImportingKey(month.key);
    try {
      await withLoading(
        () => adminApi.pelagicImportMonth(month.year, month.month, { intervalDays: month.intervalDays }),
        'Import en cours',
        `Téléchargement des données ${month.label}…`
      );
      await showSuccess('Import lancé', `${month.label} traité avec succès.`);
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

      <section className="card schedule-card fade-in-up">
        <div className="section-title">
          <CalendarClock size={22} />
          <div>
            <h2>Import automatique quotidien</h2>
            <p>Exemple : chaque nuit à 01:00, importer automatiquement la journée de la veille.</p>
          </div>
        </div>

        {draft && (
          <form className="schedule-form" onSubmit={saveSchedule}>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              />
              <span>Activer l&apos;import automatique</span>
            </label>
            <label>
              Heure d&apos;exécution
              <input
                type="time"
                value={draft.time}
                onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                required
              />
            </label>
            <label>
              Fuseau horaire
              <select value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </label>
            <label>
              Intervalle (jours)
              <select
                value={draft.intervalDays}
                onChange={(e) => setDraft({ ...draft, intervalDays: Number(e.target.value) })}
              >
                {[1, 7, 15, 30].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button type="submit" className="btn primary">
              <Save size={16} /> Enregistrer la planification
            </button>
          </form>
        )}

        <p className="schedule-hint">
          <Clock3 size={16} />
          {schedule.description || 'Planification non configurée'}
        </p>
        <div className="schedule-status-grid">
          <div className={`schedule-status-card ${schedule.schedulerActive ? 'ok' : 'ko'}`}>
            <strong>Planificateur</strong>
            <span>{schedule.schedulerActive ? 'Actif' : 'Inactif'}</span>
          </div>
          <div className="schedule-status-card">
            <strong>Prochaine exécution</strong>
            <span>
              {schedule.nextRunAt
                ? new Date(schedule.nextRunAt).toLocaleString('fr-FR', { timeZone: schedule.timezone })
                : '—'}
            </span>
          </div>
          <div className="schedule-status-card">
            <strong>Dernier import auto (cron)</strong>
            <span>
              {schedule.lastAutomaticSyncAt
                ? new Date(schedule.lastAutomaticSyncAt).toLocaleString('fr-FR', { timeZone: schedule.timezone })
                : 'Jamais — attendez la prochaine exécution ou testez via « Sync maintenant »'}
            </span>
          </div>
        </div>
        {!schedule.schedulerActive && (
          <p className="alert">
            Le planificateur n&apos;est pas actif. Vérifiez que la case « Activer l&apos;import automatique » est cochée,
            puis enregistrez. Redémarrez l&apos;API si besoin : <code>docker compose restart api</code>.
          </p>
        )}
      </section>

      <div className="planning-stats fade-in-up">
        <div className="mini-stat success">
          <CheckCircle2 size={18} />
          <span>{stats.complete} mois complets</span>
        </div>
        <div className="mini-stat warning">
          <CircleDashed size={18} />
          <span>{stats.pending} mois à compléter</span>
        </div>
        <div className="mini-stat">
          <CalendarClock size={18} />
          <span>{stats.total} mois suivis</span>
        </div>
      </div>

      <section className="card months-card fade-in-up">
        <div className="months-toolbar">
          <h2>Historique mensuel (2020 → aujourd&apos;hui)</h2>
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

        <div className="erp-table-panel" style={{ border: '1px solid var(--erp-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table months-table">
            <thead>
              <tr>
                <th>Mois</th>
                <th>Planification</th>
                <th>Intervalle</th>
                <th>Progression</th>
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
                      <span className="schedule-pill">{month.scheduleTime}</span>
                      <small>{month.scheduleTimezone}</small>
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
                      <div className="progress-cell">
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <small>{month.importedDays}/{month.totalDays} jours</small>
                      </div>
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
                      {month.status !== 'future' && (
                        <button
                          type="button"
                          className="btn sm primary"
                          disabled={importingKey === month.key || month.status === 'running'}
                          onClick={() => importMonth(month)}
                        >
                          {importingKey === month.key ? <Loader2 className="spin" size={14} /> : <Play size={14} />}
                          Importer
                        </button>
                      )}
                      {month.status === 'complete' && (
                        <span className="icon-action ok" title="Mois importé avec succès">
                          <Download size={14} />
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
