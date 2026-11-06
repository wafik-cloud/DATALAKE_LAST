import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../lib/auth';
import InrhBrand from '../components/InrhBrand';
export default function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const resetToken = new URLSearchParams(window.location.hash.slice(1)).get('reset');
  const [mode, setMode] = useState(resetToken ? 'reset' : 'login');
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ login: '', password: '', confirm: '', email: '', name: '', key: '' });
  useEffect(() => { api.get('/api/auth/status').then(r => setSetup(r.data.setupRequired)).catch(() => setMessage('La plateforme est momentanément indisponible.')); }, []);
  const field = (key: keyof typeof form, label: string, type = 'text') => <label>{label}<input type={type} required value={form[key]} minLength={key === 'password' || key === 'confirm' ? 12 : undefined} maxLength={key === 'password' || key === 'confirm' ? 128 : 254} autoComplete={key === 'password' ? mode === 'login' ? 'current-password' : 'new-password' : key === 'login' ? 'username' : undefined} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>;
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      if ((mode === 'reset' || mode === 'setup') && form.password !== form.confirm) throw new Error('Les mots de passe ne correspondent pas.');
      if (mode === 'login') { await api.post('/api/auth/login', { login: form.login, password: form.password }); await refresh(); navigate('/admin'); }
      if (mode === 'forgot') setMessage((await api.post('/api/auth/forgot-password', { email: form.email })).data.message);
      if (mode === 'reset') { await api.post('/api/auth/reset-password', { token: resetToken, password: form.password }); window.history.replaceState(null, '', '/login'); setMode('login'); setMessage('Mot de passe réinitialisé. Connectez-vous.'); }
      if (mode === 'setup') { await api.post('/api/auth/setup', form, { headers: { 'X-Admin-Key': form.key } }); setSetup(false); setMode('login'); setMessage('Administrateur créé. Connectez-vous avec vos identifiants.'); }
    } catch (e: any) { setMessage(e.response?.data?.error || e.message || 'Opération impossible.'); }
    finally { setBusy(false); }
  }
  return <div className="login-page fade-in"><div className="login-shell fade-in-up"><div className="login-hero"><InrhBrand variant="login" title="PDS VESSEL TRACKING" /><p className="login-hero-text">Votre espace de suivi et de gestion des données halieutiques.</p><p className="login-hero-text">Accès personnel · Droits attribués · Activités tracées</p></div><form className="login-card" onSubmit={submit}>
    <h2>{mode === 'login' ? 'Connexion à la plateforme' : mode === 'forgot' ? 'Mot de passe oublié' : mode === 'setup' ? 'Premier administrateur' : 'Nouveau mot de passe'}</h2>
    {mode === 'setup' && <>{field('name', 'Nom complet')}{field('email', 'Email déclaré', 'email')}{field('key', 'Clé d’initialisation administrateur', 'password')}</>}
    {(mode === 'login' || mode === 'setup') && field('login', 'Identifiant')}
    {mode === 'forgot' && <><p>Utilisez l’adresse email enregistrée par votre administrateur.</p>{field('email', 'Adresse email', 'email')}</>}
    {mode !== 'forgot' && field('password', mode === 'login' ? 'Mot de passe' : 'Mot de passe (12 caractères minimum)', 'password')}
    {(mode === 'reset' || mode === 'setup') && field('confirm', 'Confirmer le mot de passe', 'password')}
    {message && <p className="access-message" role="status">{message}</p>}
    <button disabled={busy} className="btn primary" type="submit"><ShieldCheck size={16} />{busy ? 'Veuillez patienter…' : mode === 'login' ? 'Se connecter' : mode === 'forgot' ? 'Envoyer le lien' : 'Enregistrer'}</button>
    <button type="button" className="btn" onClick={() => { setMode(mode === 'login' ? 'forgot' : 'login'); setMessage(''); }}>{mode === 'login' ? 'Mot de passe oublié ?' : 'Retour à la connexion'}</button>
    {setup && mode === 'login' && <button type="button" className="btn" onClick={() => setMode('setup')}>Initialiser le premier administrateur</button>}
  </form></div></div>;
}
