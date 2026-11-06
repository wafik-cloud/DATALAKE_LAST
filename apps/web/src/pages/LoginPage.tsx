import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
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
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({ login: '', password: '', confirm: '', email: '', name: '', key: '' });
  useEffect(() => { api.get('/api/auth/status').then(r => setSetup(r.data.setupRequired)).catch(() => setMessage('La plateforme est momentanément indisponible.')); }, []);
  const field = (key: keyof typeof form, label: string, type = 'text') => (
    <div className="login-field">
      <label htmlFor={`login-${key}`}>{label}</label>
      <div className="login-input-wrap">
        <input
          id={`login-${key}`}
          type={type === 'password' && visiblePasswords[key] ? 'text' : type}
          required
          value={form[key]}
          minLength={key === 'password' || key === 'confirm' ? 12 : undefined}
          maxLength={key === 'password' || key === 'confirm' ? 128 : 254}
          autoComplete={key === 'password' ? mode === 'login' ? 'current-password' : 'new-password' : key === 'login' ? 'username' : key === 'email' ? 'email' : undefined}
          onChange={e => setForm({ ...form, [key]: e.target.value })}
          className={type === 'password' ? 'login-password-input' : undefined}
        />
        {type === 'password' && (
          <button
            type="button"
            className="login-password-toggle"
            aria-label={`${visiblePasswords[key] ? 'Masquer' : 'Afficher'} : ${label}`}
            aria-pressed={Boolean(visiblePasswords[key])}
            onClick={() => setVisiblePasswords({ ...visiblePasswords, [key]: !visiblePasswords[key] })}
          >
            {visiblePasswords[key] ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
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
  const title = mode === 'login' ? 'Bienvenue' : mode === 'forgot' ? 'Mot de passe oublié' : mode === 'setup' ? 'Premier administrateur' : 'Nouveau mot de passe';

  return (
    <main className="login-page fade-in">
      <div className="login-shell fade-in-up">
        <form className="login-card" onSubmit={submit} aria-labelledby="login-title">
          <div className="login-card-brand"><InrhBrand variant="compact" /></div>
          <header className="login-heading">
            <p className="login-platform-name">PDS Vessel Tracking</p>
            <h1 id="login-title">{title}</h1>
            <p className="login-description">
              {mode === 'login' ? 'Connectez-vous à votre espace de travail.' : mode === 'forgot' ? 'Saisissez l’adresse email enregistrée par votre administrateur.' : mode === 'setup' ? 'Créez le compte administrateur de la plateforme.' : 'Choisissez votre nouveau mot de passe.'}
            </p>
          </header>

          <div className="login-fields">
            {mode === 'setup' && <>{field('name', 'Nom complet')}{field('email', 'Email déclaré', 'email')}{field('key', 'Clé d’initialisation administrateur', 'password')}</>}
            {(mode === 'login' || mode === 'setup') && field('login', 'Identifiant')}
            {mode === 'forgot' && field('email', 'Adresse email', 'email')}
            {mode !== 'forgot' && field('password', mode === 'login' ? 'Mot de passe' : 'Mot de passe (12 caractères minimum)', 'password')}
            {(mode === 'reset' || mode === 'setup') && field('confirm', 'Confirmer le mot de passe', 'password')}
          </div>

          {message && <p className="access-message" role="status">{message}</p>}
          <button disabled={busy} className="btn primary login-submit" type="submit">
            {busy ? 'Veuillez patienter…' : mode === 'login' ? 'Se connecter' : mode === 'forgot' ? 'Envoyer le lien' : 'Enregistrer'}
            {!busy && <ArrowRight size={17} />}
          </button>
          <button type="button" className="login-secondary" onClick={() => { setMode(mode === 'login' ? 'forgot' : 'login'); setMessage(''); setVisiblePasswords({}); }}>
            {mode === 'login' ? 'Mot de passe oublié ?' : 'Retour à la connexion'}
          </button>
          {setup && mode === 'login' && <button type="button" className="login-secondary" onClick={() => setMode('setup')}>Initialiser le premier administrateur</button>}
        </form>
        <p className="login-footer">Plateforme de suivi des données halieutiques</p>
      </div>
    </main>
  );
}
