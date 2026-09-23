import { useEffect, useState } from 'react';
import { CalendarClock, Copy, Play, Plus, Save, Trash2, X } from 'lucide-react';
import { adminApi } from '../api/client';
import { confirmAction, showError, showSuccess, withLoading } from '../lib/swal';

type Schedule = {
  id: string; name: string; description?: string | null; enabled: boolean; frequency: string; cron: string;
  timezone: string; exportTypes: string[]; intervalDays: number; startDate?: string | null; endDate?: string | null;
  imeis: string[]; tags: string[]; deviceInfo: boolean; withLastSeen: boolean; includeErrant: boolean;
  catchupMissing: boolean; maxRetries: number; lastRunAt?: string | null; lastRunStatus?: string | null;
};

const empty = {
  name: '', description: '', enabled: true, frequency: 'DAILY', time: '01:00', customCron: '0 1 * * *',
  weekday: 1, monthday: 1, timezone: 'Africa/Casablanca', exportTypes: ['trips', 'points'], intervalDays: 1,
  startDate: '', endDate: '', imeis: '', tags: '', deviceInfo: true, withLastSeen: true,
  includeErrant: false, catchupMissing: true, maxRetries: 3,
};

function cronFromForm(form: typeof empty) {
  const [hour, minute] = form.time.split(':').map(Number);
  if (form.frequency === 'WEEKLY') return `${minute} ${hour} * * ${form.weekday}`;
  if (form.frequency === 'MONTHLY') return `${minute} ${hour} ${form.monthday} * *`;
  if (form.frequency === 'CUSTOM') return form.customCron;
  return `${minute} ${hour} * * *`;
}

export default function MultiSchedulesPanel() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);

  async function load() { const response = await adminApi.pelagicSchedules(); setSchedules(response.data.schedules); }
  useEffect(() => { load().catch(() => undefined); }, []);

  function payload() {
    return {
      ...form, cron: cronFromForm(form), startDate: form.startDate || null, endDate: form.endDate || null,
      imeis: form.imeis.split(',').map((value) => value.trim()).filter(Boolean),
      tags: form.tags.split(',').map((value) => value.trim()).filter(Boolean),
    };
  }

  function beginEdit(schedule?: Schedule) {
    setEditing(schedule || null);
    setForm(schedule ? {
      ...empty, name: schedule.name, description: schedule.description || '', enabled: schedule.enabled,
      frequency: schedule.frequency, customCron: schedule.cron, timezone: schedule.timezone,
      exportTypes: schedule.exportTypes, intervalDays: schedule.intervalDays, startDate: schedule.startDate || '',
      endDate: schedule.endDate || '', imeis: schedule.imeis.join(', '), tags: schedule.tags.join(', '),
      deviceInfo: schedule.deviceInfo, withLastSeen: schedule.withLastSeen, includeErrant: schedule.includeErrant,
      catchupMissing: schedule.catchupMissing, maxRetries: schedule.maxRetries,
    } : empty);
    setOpen(true);
  }

  function toggleExport(type: string) {
    setForm((current) => ({ ...current, exportTypes: current.exportTypes.includes(type) ? current.exportTypes.filter((value) => value !== type) : [...current.exportTypes, type] }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await withLoading(() => editing ? adminApi.pelagicUpdateNamedSchedule(editing.id, payload()) : adminApi.pelagicCreateSchedule(payload()), 'Planification', 'Enregistrement…');
      setOpen(false); await load(); await showSuccess(editing ? 'Planification mise à jour' : 'Planification créée');
    } catch (error: any) { await showError('Enregistrement impossible', error.response?.data?.error); }
  }

  return <section className="named-schedules-section fade-in-up">
    <div className="section-head">
      <div><h2>Scénarios d&apos;acquisition</h2><p className="section-subtitle">Planifications indépendantes par source, période et flotte.</p></div>
      <button type="button" className="btn primary" onClick={() => beginEdit()}><Plus size={15} /> Nouvelle planification</button>
    </div>
    <div className="named-schedules-grid">
      {schedules.map((schedule) => <article className="schedule-item" key={schedule.id}>
        <button type="button" className="schedule-item-main" onClick={() => beginEdit(schedule)}>
          <span className={`schedule-state ${schedule.enabled ? 'active' : ''}`}><CalendarClock size={18} /></span>
          <span><strong>{schedule.name}</strong><small>{schedule.frequency} · {schedule.cron} · {schedule.timezone}</small><small>{schedule.exportTypes.join(' + ')} · pas {schedule.intervalDays} j</small></span>
        </button>
        <div className="schedule-item-status"><span className={`badge ${schedule.lastRunStatus || 'PENDING'}`}>{schedule.lastRunStatus || 'JAMAIS EXÉCUTÉE'}</span><small>{schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString('fr-FR') : 'Aucune exécution'}</small></div>
        <div className="schedule-item-actions">
          <button type="button" className="erp-icon-btn dark" title="Exécuter maintenant" onClick={async () => { await withLoading(() => adminApi.pelagicRunSchedule(schedule.id), 'Exécution', 'Import planifié en cours…'); await load(); }}><Play size={15} /></button>
          <button type="button" className="erp-icon-btn dark" title="Dupliquer" onClick={async () => { await adminApi.pelagicDuplicateSchedule(schedule.id); await load(); }}><Copy size={15} /></button>
          <button type="button" className="erp-icon-btn danger-icon" title="Supprimer" onClick={async () => { if (await confirmAction('Supprimer la planification', schedule.name, 'Supprimer')) { await adminApi.pelagicDeleteSchedule(schedule.id); await load(); } }}><Trash2 size={15} /></button>
        </div>
      </article>)}
      {!schedules.length && <div className="schedule-empty">Aucun scénario indépendant. Créez une planification pour automatiser une flotte ou un type d&apos;export.</div>}
    </div>

    {open && <div className="modal-backdrop"><form className="schedule-editor" onSubmit={save}>
      <div className="map-modal-header"><div><h2>{editing ? 'Modifier la planification' : 'Nouvelle planification'}</h2><p>Définissez le rythme, les données et le périmètre scientifique.</p></div><button type="button" className="erp-icon-btn modal-close-btn" onClick={() => setOpen(false)}><X size={18} /></button></div>
      <div className="schedule-editor-body">
        <label>Nom<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex. Positions quotidiennes flotte nord" /></label>
        <label>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="schedule-editor-grid">
          <label>Fréquence<select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}><option value="DAILY">Quotidienne</option><option value="WEEKLY">Hebdomadaire</option><option value="MONTHLY">Mensuelle</option><option value="CUSTOM">CRON personnalisé</option></select></label>
          <label>Heure<input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
          <label>Fuseau<select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}><option>Africa/Casablanca</option><option>UTC</option><option>Europe/Paris</option></select></label>
          {form.frequency === 'WEEKLY' && <label>Jour<select value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}><option value="1">Lundi</option><option value="2">Mardi</option><option value="3">Mercredi</option><option value="4">Jeudi</option><option value="5">Vendredi</option><option value="6">Samedi</option><option value="0">Dimanche</option></select></label>}
          {form.frequency === 'MONTHLY' && <label>Jour du mois<input type="number" min="1" max="28" value={form.monthday} onChange={(e) => setForm({ ...form, monthday: Number(e.target.value) })} /></label>}
          {form.frequency === 'CUSTOM' && <label>Expression CRON<input value={form.customCron} onChange={(e) => setForm({ ...form, customCron: e.target.value })} /></label>}
          <label>Pas d&apos;acquisition<input type="number" min="1" max="30" value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: Number(e.target.value) })} /></label>
          <label>Date de début<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
          <label>Date de fin<input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          <label>IMEI<input value={form.imeis} onChange={(e) => setForm({ ...form, imeis: e.target.value })} placeholder="Séparés par des virgules" /></label>
          <label>Tags<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Séparés par des virgules" /></label>
          <label>Tentatives<input type="number" min="0" max="10" value={form.maxRetries} onChange={(e) => setForm({ ...form, maxRetries: Number(e.target.value) })} /></label>
        </div>
        <div className="schedule-choice-row"><button type="button" className={form.exportTypes.includes('trips') ? 'active' : ''} onClick={() => toggleExport('trips')}>Trips</button><button type="button" className={form.exportTypes.includes('points') ? 'active' : ''} onClick={() => toggleExport('points')}>Points</button></div>
        <div className="schedule-check-grid">
          <label><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Active</label>
          <label><input type="checkbox" checked={form.catchupMissing} onChange={(e) => setForm({ ...form, catchupMissing: e.target.checked })} /> Rattraper les lacunes</label>
          <label><input type="checkbox" checked={form.deviceInfo} onChange={(e) => setForm({ ...form, deviceInfo: e.target.checked })} /> Informations appareil</label>
          <label><input type="checkbox" checked={form.withLastSeen} onChange={(e) => setForm({ ...form, withLastSeen: e.target.checked })} /> Dernière position</label>
          <label><input type="checkbox" checked={form.includeErrant} onChange={(e) => setForm({ ...form, includeErrant: e.target.checked })} /> Positions errantes</label>
        </div>
      </div>
      <div className="schedule-editor-footer"><button type="button" className="btn" onClick={() => setOpen(false)}>Annuler</button><button type="submit" className="btn primary" disabled={!form.exportTypes.length}><Save size={15} /> Enregistrer</button></div>
    </form></div>}
  </section>;
}
