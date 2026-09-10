import { formatDateTime } from '../../lib/vesselMap/timeUtils';
import type { AnimatedVesselState } from '../../lib/vesselMap/types';

function shortNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 5 }).format(value);
}

export default function VesselDetails({ state }: { state: AnimatedVesselState | null }) {
  if (!state) {
    return (
      <aside className="vessel-details-panel">
        <h3>Détails bateau</h3>
        <p>Sélectionnez ou cliquez sur un bateau pour consulter les informations de la ligne courante.</p>
      </aside>
    );
  }

  const { point, track } = state;
  const hidden = new Set(['Lat', 'Lng', 'Time', 'Speed (M/S)', 'Heading']);
  const extraRows = Object.entries(point.raw || {}).filter(([key, value]) => value && !hidden.has(key)).slice(0, 24);

  return (
    <aside className="vessel-details-panel">
      <h3>{point.vesselName || track.name}</h3>
      <dl>
        <div><dt>Identifiant</dt><dd>{track.id}</dd></div>
        <div><dt>Voyage</dt><dd>{point.trip}</dd></div>
        <div><dt>Timestamp</dt><dd>{formatDateTime(point.time)}</dd></div>
        <div><dt>Latitude</dt><dd>{shortNumber(point.lat)}</dd></div>
        <div><dt>Longitude</dt><dd>{shortNumber(point.lng)}</dd></div>
        <div><dt>Vitesse</dt><dd>{point.speed == null ? '-' : `${shortNumber(point.speed)} m/s`}</dd></div>
        <div><dt>Cap</dt><dd>{state.heading == null ? '-' : `${shortNumber(state.heading)}°`}</dd></div>
        <div><dt>Statut</dt><dd>{point.status || '-'}</dd></div>
        <div><dt>IMEI</dt><dd>{point.imei || '-'}</dd></div>
        <div><dt>Immatriculation</dt><dd>{point.registration || '-'}</dd></div>
        <div><dt>Device ID</dt><dd>{point.deviceId || '-'}</dd></div>
      </dl>
      {extraRows.length > 0 && (
        <>
          <h4>Autres colonnes</h4>
          <dl>
            {extraRows.map(([key, value]) => (
              <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </>
      )}
    </aside>
  );
}
