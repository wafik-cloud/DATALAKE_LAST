import { FormEvent, useState } from 'react';
import { Play, HelpCircle } from 'lucide-react';
import { adminApi } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import { confirmAction, showError, showSuccess, withLoading } from '../../lib/swal';

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await confirmAction(
      'Lancer l\'import manuel',
      `Période ${form.dateFrom} → ${form.dateTo}`
    );
    if (!ok) return;

    try {
      await withLoading(
        () => adminApi.pelagicSync({
          ...form,
          imeis: form.imeis ? form.imeis.split(',').map((s) => s.trim()) : undefined,
          tags: form.tags ? form.tags.split(',').map((s) => s.trim()) : undefined,
        }),
        'Import en cours',
        'Téléchargement et stockage des données…'
      );
      await showSuccess('Import terminé');
    } catch (err: any) {
      await showError('Import échoué', err.response?.data?.error || 'Erreur');
    }
  }

  return (
    <div>
      <PageHeader
        title="Import manuel"
        subtitle="Lancez un import ponctuel sur une période personnalisée"
      />

      <div className="card hint-card fade-in-up" style={{ marginBottom: '1rem' }}>
        <p><HelpCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          <strong>IMEI</strong> : identifiant du traceur GPS (laisser vide = tous les bateaux).
          <strong> Intervalle</strong> : découpe la période en tranches (1 = jour par jour).
        </p>
      </div>

      <form className="card form-card grid-2 fade-in-up" onSubmit={onSubmit}>
        <label>Date début<input type="date" required value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} /></label>
        <label>Date fin<input type="date" required value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} /></label>
        <label>Types
          <select multiple value={form.exportTypes} onChange={(e) => setForm({ ...form, exportTypes: Array.from(e.target.selectedOptions, (o) => o.value) })}>
            <option value="trips">Trips</option>
            <option value="points">Points</option>
          </select>
        </label>
        <label>Intervalle (jours)<input type="number" min={1} max={30} value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: Number(e.target.value) })} /></label>
        <label>IMEI<input value={form.imeis} onChange={(e) => setForm({ ...form, imeis: e.target.value })} placeholder="Optionnel" /></label>
        <label>Tags<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Optionnel" /></label>
        <label><input type="checkbox" checked={form.force} onChange={(e) => setForm({ ...form, force: e.target.checked })} /> Forcer réexécution</label>
        <button className="btn primary" type="submit"><Play size={16} /> Lancer l&apos;import</button>
      </form>
    </div>
  );
}
