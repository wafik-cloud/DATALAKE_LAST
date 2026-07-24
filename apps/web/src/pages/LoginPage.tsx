import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck } from 'lucide-react';
import { showError, withLoading } from '../lib/swal';
import InrhBrand from '../components/InrhBrand';

export default function LoginPage() {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState('');
  const [user, setUser] = useState('admin');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await withLoading(async () => {
        const base = import.meta.env.VITE_API_URL || 'http://localhost:5001';
        await axios.get(`${base}/api/admin/dashboard`, {
          headers: { 'X-Admin-Key': apiKey, 'X-User': user },
        });
        localStorage.setItem('adminApiKey', apiKey);
        localStorage.setItem('adminUser', user);
        navigate('/admin');
      }, 'Connexion', 'Vérification des identifiants…');
    } catch {
      await showError('Connexion refusée', 'Clé administrateur invalide ou API indisponible');
    }
  }

  return (
    <div className="login-page fade-in">
      <div className="login-shell fade-in-up">
        <div className="login-hero">
          <InrhBrand variant="login" title="DATALAKE" />
          <p className="login-hero-text">
            Plateforme de stockage et synchronisation des données halieutiques Pelagic Data.
          </p>
        </div>
        <form className="login-card" onSubmit={onSubmit}>
          <h2>Connexion administration</h2>
          <label>
            Utilisateur
            <input value={user} onChange={(e) => setUser(e.target.value)} />
          </label>
          <label>
            Clé admin (X-Admin-Key)
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
          </label>
          <button type="submit" className="btn primary">
            <ShieldCheck size={16} /> Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}
