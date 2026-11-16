import { useEffect, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../lib/auth';
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
    <form className="access-card access-form" onSubmit={changePassword} aria-labelledby="change-password-title">
      <div>
        <h2 id="change-password-title">Changer mon mot de passe</h2>
        <p>Choisissez un mot de passe différent de 12 à 128 caractères. Après modification, toutes vos sessions seront fermées.</p>
      </div>
      <label>Mot de passe actuel<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={e => setCurrent(e.target.value)} disabled={busy} /></label>
      <label>Nouveau mot de passe<input name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
      <label>Confirmer le nouveau mot de passe<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} /></label>
      {passwordError && <p className="access-message" role="alert">{passwordError}</p>}
      <button type="submit" disabled={busy} className="btn primary">{busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</button>
    </form>
    <div className="access-card"><h2>Mes sessions</h2><p>Expiration après 30 minutes d’inactivité ou 12 heures de connexion.</p><div className="access-table-wrap"><table className="access-table"><thead><tr><th>Ouverture</th><th>Dernière activité</th><th>Adresse IP / navigateur</th><th>État</th><th></th></tr></thead><tbody>{sessions.map(s => <tr key={s.id}><td>{new Date(s.createdAt).toLocaleString('fr-FR')}</td><td>{new Date(s.lastSeenAt).toLocaleString('fr-FR')}</td><td>{s.ip}<small>{s.userAgent}</small></td><td>{!s.revokedAt && new Date(s.expiresAt).getTime() > Date.now() && new Date(s.lastSeenAt).getTime() > Date.now() - 1800000 ? 'Active' : 'Fermée / expirée'}</td><td>{!s.revokedAt && <button className="btn sm" onClick={async () => { try { await api.delete('/api/auth/sessions/' + s.id); await refresh(); await load(); } catch { setMessage('Révocation impossible.'); } }}>Fermer</button>}</td></tr>)}</tbody></table></div></div>
  </div>;
}
