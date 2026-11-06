import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../lib/auth';
export default function AccountPage() {
  const { user, refresh } = useAuth(); const navigate = useNavigate();
  const [sessions, setSessions] = useState<any[]>([]); const [message, setMessage] = useState('');
  const [currentPassword, setCurrent] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false);
  async function load() { try { setSessions((await api.get('/api/auth/sessions')).data); } catch { setMessage('Impossible de charger les sessions.'); } }
  useEffect(() => { void load(); }, []);
  return <div className="access-page"><div className="access-heading"><div><span className="access-eyebrow">ESPACE PERSONNEL</span><h1>Mon compte</h1><p>{user?.name} · {user?.login} · {user?.email}</p></div></div>
    {user?.mustChangePassword && <p className="access-message">Choisissez un nouveau mot de passe pour activer votre accès à la plateforme.</p>}
    {message && <p className="access-message" role="status">{message}</p>}
    <form className="access-card access-form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { if (password !== confirm) throw new Error('Les mots de passe ne correspondent pas.'); await api.post('/api/auth/password', { currentPassword, password }); await refresh(); navigate('/login'); } catch (err: any) { setMessage(err.response?.data?.error || err.message); } finally { setBusy(false); } }}>
      <h2>Changer mon mot de passe</h2><p>Après modification, toutes vos sessions seront fermées.</p>
      <label>Mot de passe actuel<input type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrent(e.target.value)} /></label>
      <label>Nouveau mot de passe<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>Confirmer le mot de passe<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      <button disabled={busy} className="btn primary">Enregistrer le mot de passe</button>
    </form>
    <div className="access-card"><h2>Mes sessions</h2><p>Expiration après 30 minutes d’inactivité ou 12 heures de connexion.</p><div className="access-table-wrap"><table className="access-table"><thead><tr><th>Ouverture</th><th>Dernière activité</th><th>Adresse IP / navigateur</th><th>État</th><th></th></tr></thead><tbody>{sessions.map(s => <tr key={s.id}><td>{new Date(s.createdAt).toLocaleString('fr-FR')}</td><td>{new Date(s.lastSeenAt).toLocaleString('fr-FR')}</td><td>{s.ip}<small>{s.userAgent}</small></td><td>{!s.revokedAt && new Date(s.expiresAt).getTime() > Date.now() && new Date(s.lastSeenAt).getTime() > Date.now() - 1800000 ? 'Active' : 'Fermée / expirée'}</td><td>{!s.revokedAt && <button className="btn sm" onClick={async () => { try { await api.delete('/api/auth/sessions/' + s.id); await refresh(); await load(); } catch { setMessage('Révocation impossible.'); } }}>Fermer</button>}</td></tr>)}</tbody></table></div></div>
  </div>;
}
