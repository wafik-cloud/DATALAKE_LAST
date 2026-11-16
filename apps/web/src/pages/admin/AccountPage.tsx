import { useEffect, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Check, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../lib/auth';
type PasswordFieldProps = {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  current?: boolean;
  disabled: boolean;
  describedBy?: string;
};

function PasswordField({ name, label, value, onChange, current, disabled, describedBy }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="account-password-field">
      <label htmlFor={name}>{label}</label>
      <div className="account-password-input">
        <input
          id={name}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={current ? 'current-password' : 'new-password'}
          aria-describedby={describedBy}
          required
          minLength={current ? undefined : 12}
          maxLength={128}
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          aria-label={`${visible ? 'Masquer' : 'Afficher'} le champ « ${label} »`}
          onClick={() => setVisible(!visible)}
          disabled={disabled}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { user, refresh } = useAuth(); const navigate = useNavigate();
  const [sessions, setSessions] = useState<any[]>([]); const [message, setMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [currentPassword, setCurrent] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false);
  async function load() { try { setSessions((await api.get('/api/auth/sessions')).data); } catch { setMessage('Impossible de charger les sessions.'); } }
  useEffect(() => { void load(); }, []);
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setPasswordError('Les nouveaux mots de passe ne correspondent pas.');
      return;
    }

    setPasswordError('');
    setBusy(true);
    try {
      await api.post('/api/auth/password', { currentPassword, password });
      navigate('/login', { replace: true, state: { passwordChanged: true } });
      await refresh();
    } catch (error) {
      const message = isAxiosError<{ error: string }>(error) ? error.response?.data?.error : undefined;
      setPasswordError(message || 'Impossible de modifier le mot de passe. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="access-page"><div className="access-heading"><div><span className="access-eyebrow">ESPACE PERSONNEL</span><h1>Mon compte</h1><p>{user?.name} · {user?.login} · {user?.email}</p></div></div>
    {user?.mustChangePassword && <p className="access-message">Choisissez un nouveau mot de passe pour activer votre accès à la plateforme.</p>}
    {message && <p className="access-message" role="status">{message}</p>}
    <form className="access-card account-password-form" onSubmit={changePassword} aria-labelledby="change-password-title">
      <header className="account-password-header">
        <span className="account-password-icon"><LockKeyhole size={22} aria-hidden="true" /></span>
        <div>
          <h2 id="change-password-title">Changer mon mot de passe</h2>
          <p id="account-password-rules">Choisissez un mot de passe différent de 12 à 128 caractères.</p>
        </div>
      </header>
      <div className="account-password-fields">
        <PasswordField name="currentPassword" label="Mot de passe actuel" value={currentPassword} onChange={setCurrent} current disabled={busy} />
        <PasswordField name="newPassword" label="Nouveau mot de passe" value={password} onChange={setPassword} disabled={busy} describedBy="account-password-rules" />
        <PasswordField name="confirmPassword" label="Confirmer le nouveau mot de passe" value={confirm} onChange={setConfirm} disabled={busy} />
      </div>
      {passwordError && <p className="account-password-error" role="alert">{passwordError}</p>}
      <footer className="account-password-footer">
        <p><ShieldCheck size={18} aria-hidden="true" /> Toutes vos sessions seront fermées après l’enregistrement.</p>
        <button type="submit" disabled={busy} className="btn primary account-password-submit">
          <Check size={17} aria-hidden="true" />
          {busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
        </button>
      </footer>
    </form>
    <div className="access-card"><h2>Mes sessions</h2><p>Expiration après 30 minutes d’inactivité ou 12 heures de connexion.</p><div className="access-table-wrap"><table className="access-table"><thead><tr><th>Ouverture</th><th>Dernière activité</th><th>Adresse IP / navigateur</th><th>État</th><th></th></tr></thead><tbody>{sessions.map(s => <tr key={s.id}><td>{new Date(s.createdAt).toLocaleString('fr-FR')}</td><td>{new Date(s.lastSeenAt).toLocaleString('fr-FR')}</td><td>{s.ip}<small>{s.userAgent}</small></td><td>{!s.revokedAt && new Date(s.expiresAt).getTime() > Date.now() && new Date(s.lastSeenAt).getTime() > Date.now() - 1800000 ? 'Active' : 'Fermée / expirée'}</td><td>{!s.revokedAt && <button className="btn sm" onClick={async () => { try { await api.delete('/api/auth/sessions/' + s.id); await refresh(); await load(); } catch { setMessage('Révocation impossible.'); } }}>Fermer</button>}</td></tr>)}</tbody></table></div></div>
  </div>;
}
