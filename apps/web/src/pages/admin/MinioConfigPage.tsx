import { useEffect, useState } from 'react';
import { adminApi } from '../../api/client';

export default function MinioConfigPage() {
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    adminApi.storageStatus().then((r) => setStatus(r.data.minio));
  }, []);

  return (
    <div>
      <header className="page-header"><h1>Configuration MinIO</h1></header>
      {status && (
        <div className="card form-card">
          <p><strong>Endpoint public :</strong> {status.endpoint}</p>
          <p><strong>Console :</strong> <a href={status.consoleUrl} target="_blank" rel="noreferrer">{status.consoleUrl}</a></p>
          <p><strong>Bucket :</strong> {status.bucket}</p>
          <p><strong>Région :</strong> {status.region}</p>
          <p><strong>SSL :</strong> {status.ssl ? 'Oui' : 'Non'}</p>
          <p><strong>État :</strong> <span className={status.connected ? 'ok' : 'ko'}>{status.connected ? 'Connecté' : 'Erreur'}</span></p>
          <p className="hint">Les identifiants MinIO sont gérés via variables d'environnement (.env).</p>
        </div>
      )}
    </div>
  );
}
