import { FormEvent, useState } from 'react';
import {
  CalendarDays,
  Clock3,
  Filter,
  Info,
  Play,
  Radio,
  RotateCcw,
  Satellite,
  ShipWheel,
} from 'lucide-react';
import { adminApi } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import { confirmAction, showError, showInfo, showSuccess, withLoading } from '../../lib/swal';

const EXPORT_TYPE_OPTIONS = [
  { value: 'trips', label: 'Trips', description: 'Trajets consolidés', icon: ShipWheel },
  { value: 'points', label: 'Points', description: 'Positions GPS détaillées', icon: Radio },
] as const;

function formatDateLabel(value: string) {
  if (!value) return 'Non renseignée';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

export default function SyncPage() {
  const [form, setForm] = useState({
    dateFrom: '',
    dateTo: '',
    exportTypes: ['trips'] as string[],
    imeis: '',
    tags: '',
    force: false,
    intervalDays: 1,
    deviceInfo: true,
    withLastSeen: true,
    includeErrant: false,
  });

  const hasPoints = form.exportTypes.includes('points');
  const periodReady = form.dateFrom && form.dateTo;

  function toggleExportType(value: string) {
    const next = form.exportTypes.includes(value)
      ? form.exportTypes.filter((type) => type !== value)
      : [...form.exportTypes, value];

    setForm({ ...form, exportTypes: next.length ? next : [value] });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await confirmAction(
      'Lancer l\'import manuel',
      `Période ${form.dateFrom} → ${form.dateTo}`
    );
    if (!ok) return;

    try {
      const response = await withLoading(
        () => adminApi.pelagicSync({
          ...form,
          imeis: form.imeis ? form.imeis.split(',').map((s) => s.trim()) : undefined,
          tags: form.tags ? form.tags.split(',').map((s) => s.trim()) : undefined,
        }),
        'Import en cours',
        'Téléchargement et stockage des données…'
      );

      const results = Array.isArray(response.data?.results) ? response.data.results : [];
      const failures = Array.isArray(response.data?.failures) ? response.data.failures : [];
      const skipped = results.filter((result: any) => result.skipped);
      const imported = results.filter((result: any) => !result.skipped);
      const empty = imported.filter((result: any) => Number(result.job?.rowCount || 0) === 0);

      if (failures.length) {
        const details = failures
          .map((failure: any) => `${failure.exportType} ${failure.dateFrom} → ${failure.dateTo}: ${failure.error}`)
          .join('\n');
        await showError('Import partiel', details);
      } else if (imported.length === 0 && skipped.length) {
        await showInfo(
          'Import déjà présent',
          `${skipped.length} export(s) existent déjà pour cette période. Activez « Forcer réexécution » pour les télécharger à nouveau.`
        );
      } else if (empty.length === imported.length && imported.length > 0) {
        await showInfo('Import terminé sans données', 'Pelagic n’a retourné aucun enregistrement pour cette période.');
      } else {
        const importedCount = imported.length - empty.length;
        const details = [
          `${importedCount} nouveau(x) fichier(s) créé(s).`,
          empty.length ? `${empty.length} export(s) sans données.` : '',
          skipped.length ? `${skipped.length} export(s) déjà présent(s).` : '',
        ].filter(Boolean).join(' ');
        await showSuccess('Import terminé', details);
      }
    } catch (err: any) {
      await showError('Import échoué', err.response?.data?.error || 'Erreur');
    }
  }

  return (
    <div className="sync-page">
      <PageHeader
        title="Import manuel"
        subtitle="Lancez un import ponctuel sur une période personnalisée"
      />

      <form className="sync-shell fade-in-up" onSubmit={onSubmit}>
        <section className="sync-main-panel">
          <div className="sync-section">
            <div className="section-title compact">
              <CalendarDays size={18} />
              <div>
                <h2>Période</h2>
                <p>Choisissez la plage à récupérer depuis Pelagic.</p>
              </div>
            </div>

            <div className="sync-date-grid">
              <label className="sync-field">
                <span>Date début</span>
                <input
                  type="date"
                  required
                  value={form.dateFrom}
                  onChange={(e) => setForm({ ...form, dateFrom: e.target.value })}
                />
              </label>
              <label className="sync-field">
                <span>Date fin</span>
                <input
                  type="date"
                  required
                  value={form.dateTo}
                  onChange={(e) => setForm({ ...form, dateTo: e.target.value })}
                />
              </label>
              <label className="sync-field interval-field">
                <span>Intervalle</span>
                <div className="stepper-input">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={form.intervalDays}
                    onChange={(e) => setForm({ ...form, intervalDays: Number(e.target.value) })}
                  />
                  <small>jours</small>
                </div>
              </label>
            </div>
          </div>

          <div className="sync-section">
            <div className="section-title compact">
              <Satellite size={18} />
              <div>
                <h2>Exports</h2>
                <p>Sélectionnez les jeux de données à importer.</p>
              </div>
            </div>

            <div className="export-type-grid">
              {EXPORT_TYPE_OPTIONS.map(({ value, label, description, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  className={`export-type-option ${form.exportTypes.includes(value) ? 'selected' : ''}`}
                  onClick={() => toggleExportType(value)}
                  aria-pressed={form.exportTypes.includes(value)}
                >
                  <Icon size={18} />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="sync-section">
            <div className="section-title compact">
              <Filter size={18} />
              <div>
                <h2>Filtres</h2>
                <p>Laissez vide pour importer toute la flotte autorisée.</p>
              </div>
            </div>

            <div className="sync-date-grid two">
              <label className="sync-field">
                <span>IMEI</span>
                <input
                  value={form.imeis}
                  onChange={(e) => setForm({ ...form, imeis: e.target.value })}
                  placeholder="Ex. 8630..., 8675..."
                />
              </label>
              <label className="sync-field">
                <span>Tags</span>
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="Ex. sardine, nord"
                />
              </label>
            </div>
          </div>
        </section>

        <aside className="sync-side-panel">
          <div className="sync-summary-card">
            <div className="summary-head">
              <Clock3 size={18} />
              <h2>Résumé</h2>
            </div>
            <dl className="sync-summary-list">
              <div>
                <dt>Début</dt>
                <dd>{formatDateLabel(form.dateFrom)}</dd>
              </div>
              <div>
                <dt>Fin</dt>
                <dd>{formatDateLabel(form.dateTo)}</dd>
              </div>
              <div>
                <dt>Exports</dt>
                <dd>{form.exportTypes.join(', ')}</dd>
              </div>
            </dl>
            {hasPoints && (
              <p className="points-window-note">
                <Info size={15} />
                Points utilise une fenêtre horaire non nulle, borne de fin exclusive.
              </p>
            )}
          </div>

          <div className="sync-options-card">
            <h2>Options</h2>
            <label className="option-row">
              <input
                type="checkbox"
                checked={form.force}
                onChange={(e) => setForm({ ...form, force: e.target.checked })}
              />
              <span>
                <strong>Forcer réexécution</strong>
                <small>Ignore les imports déjà réussis.</small>
              </span>
            </label>
          </div>

          <button className="btn primary sync-submit" type="submit" disabled={!periodReady}>
            <Play size={16} /> Lancer l&apos;import
          </button>
          <button
            className="btn sync-reset"
            type="button"
            onClick={() => setForm({
              dateFrom: '',
              dateTo: '',
              exportTypes: ['trips'],
              imeis: '',
              tags: '',
              force: false,
              intervalDays: 1,
              deviceInfo: true,
              withLastSeen: true,
              includeErrant: false,
            })}
          >
            <RotateCcw size={15} /> Réinitialiser
          </button>
        </aside>
      </form>
    </div>
  );
}
