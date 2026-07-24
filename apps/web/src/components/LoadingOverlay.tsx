import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  message?: string;
  submessage?: string;
}

export default function LoadingOverlay({
  message = 'Chargement en cours',
  submessage = 'Veuillez patienter…',
}: LoadingOverlayProps) {
  return (
    <div className="loading-overlay fade-in" role="status" aria-live="polite">
      <div className="loading-card">
        <Loader2 className="spin" size={42} />
        <p className="loading-title">{message}</p>
        <p className="loading-sub">{submessage}</p>
      </div>
    </div>
  );
}
