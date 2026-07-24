import { useEffect, useState } from 'react';
import { adminApi } from '../../api/client';

export default function PelagicConfigPage() {
  const [settings, setSettings] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState<{
    ok?: boolean;
    message: string;
    tests?: Array<{ exportType: string; ok: boolean; httpStatus?: number; message: string }>;
  } | null>(null);

  async function load() {
    const res = await adminApi.pelagicSettings();
    setSettings(res.data);
  }

  useEffect(() => { load(); }, []);

  async function onSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    await adminApi.pelagicUpdateSettings({
      syncEnabled: settings.syncEnabled,
      syncCron: settings.syncCron,
      syncTimezone: settings.syncTimezone,
      defaultImeis: settings.defaultImeisText?.split(',').map((s: string) => s.trim()).filter(Boolean) || [],
      defaultTags: settings.defaultTagsText?.split(',').map((s: string) => s.trim()).filter(Boolean) || [],
      deviceInfo: settings.deviceInfo,
      withLastSeen: settings.withLastSeen,
      includeErrant: settings.includeErrant,
      retentionDays: settings.retentionDays,
    });
    setMessage('Paramètres enregistrés');
    load();
  }

  async function testPelagic() {
    setTestResult({ message: 'Test en cours…' });
    try {
      const res = await adminApi.pelagicTest();
      setTestResult(res.data);
    } catch (err: any) {
      const data = err.response?.data;
      setTestResult({
        ok: false,
        message: data?.message || 'Échec — vérifiez token/secret dans .env',
        tests: data?.tests,
      });
    }
  }

  if (!settings) return <p>Chargement…</p>;

  const form = {
    ...settings,
    defaultImeisText: settings.defaultImeisText ?? settings.defaultImeis?.join(', '),
    defaultTagsText: settings.defaultTagsText ?? settings.defaultTags?.join(', '),
  };

  return (
    <div>
      <header className="page-header"><h1>Configuration Pelagic Data</h1></header>

      <section className="card form-card" style={{ marginBottom: '1rem' }}>
        <h2>Token et secret d'authentification</h2>
        <p className="hint">
          Les identifiants Pelagic se configurent dans le fichier <strong>.env</strong> à la racine du projet
          (jamais dans l'interface, jamais dans Git).
        </p>
        <ol className="setup-steps">
          <li>Ouvrez <code>/Users/M.WAFIK/CSID_projects/DATALAKE_LAST/.env</code></li>
          <li>Renseignez :
            <pre>{`PELAGIC_API_TOKEN=votre_token
PELAGIC_API_SECRET=votre_secret`}</pre>
          </li>
          <li>Redémarrez l'API :
            <pre>docker compose restart api</pre>
          </li>
          <li>Cliquez <strong>Tester la connexion</strong> ci-dessous</li>
        </ol>
        <div className="auth-status">
          <p>
            <strong>État :</strong>{' '}
            <span className={settings.configured ? 'ok' : 'ko'}>
              {settings.configured ? 'Token et secret détectés' : 'Non configurés (valeurs CHANGE_ME ou vides)'}
            </span>
          </p>
          <p><strong>Token (masqué) :</strong> {settings.token}</p>
          <p><strong>Secret (masqué) :</strong> {settings.secret}</p>
          <p><strong>URL API :</strong> {settings.baseUrl}</p>
        </div>
        <button type="button" className="btn primary" onClick={testPelagic}>Tester la connexion</button>
        {testResult && (
          <div className="test-result-panel">
            <p className={testResult.ok ? 'ok' : 'ko'}>{testResult.message}</p>
            {testResult.tests && testResult.tests.length > 0 && (
              <ul className="test-result-list">
                {testResult.tests.map((test) => (
                  <li key={test.exportType} className={test.ok ? 'ok' : 'ko'}>
                    <strong>{test.exportType}</strong>
                    {test.httpStatus != null ? ` — HTTP ${test.httpStatus}` : ''}
                    {' — '}
                    {test.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <form className="card form-card" onSubmit={onSaveSettings}>
        <h2>Planification et filtres par défaut</h2>
        <label><input type="checkbox" checked={form.syncEnabled} onChange={(e) => setSettings({ ...form, syncEnabled: e.target.checked })} /> Sync activée</label>
        <label>CRON<input value={form.syncCron} onChange={(e) => setSettings({ ...form, syncCron: e.target.value })} /></label>
        <label>Fuseau<input value={form.syncTimezone} onChange={(e) => setSettings({ ...form, syncTimezone: e.target.value })} /></label>
        <label>IMEI par défaut<input value={form.defaultImeisText} onChange={(e) => setSettings({ ...form, defaultImeisText: e.target.value })} placeholder="imei1, imei2" /></label>
        <label>Tags<input value={form.defaultTagsText} onChange={(e) => setSettings({ ...form, defaultTagsText: e.target.value })} /></label>
        <label><input type="checkbox" checked={form.deviceInfo} onChange={(e) => setSettings({ ...form, deviceInfo: e.target.checked })} /> deviceInfo</label>
        <label><input type="checkbox" checked={form.withLastSeen} onChange={(e) => setSettings({ ...form, withLastSeen: e.target.checked })} /> withLastSeen</label>
        <label><input type="checkbox" checked={form.includeErrant} onChange={(e) => setSettings({ ...form, includeErrant: e.target.checked })} /> errant (points)</label>
        <button className="btn primary" type="submit">Enregistrer</button>
        {message && <p className="ok">{message}</p>}
      </form>
    </div>
  );
}
