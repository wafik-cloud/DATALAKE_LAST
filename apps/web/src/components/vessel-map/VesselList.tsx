import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { VesselTrack } from '../../lib/vesselMap/types';
import VesselTrackChip from './VesselTrack';

type Props = {
  tracks: VesselTrack[];
  visibleIds: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string | null) => void;
};

export default function VesselList({ tracks, visibleIds, selectedId, onToggle, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tracks;
    return tracks.filter((track) => `${track.name} ${track.id} ${track.metadata.imei || ''} ${track.metadata.registration || ''}`.toLowerCase().includes(needle));
  }, [query, tracks]);

  return (
    <aside className="vessel-list-panel">
      <div className="vessel-search">
        <Search size={14} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher bateau" />
      </div>
      <div className="vessel-list">
        {filtered.map((track) => (
          <button
            key={track.id}
            type="button"
            className={`vessel-list-item ${selectedId === track.id ? 'selected' : ''}`}
            onClick={() => onSelect(selectedId === track.id ? null : track.id)}
          >
            <input
              type="checkbox"
              checked={visibleIds.has(track.id)}
              onChange={() => onToggle(track.id)}
              onClick={(event) => event.stopPropagation()}
            />
            <span>
              <strong><VesselTrackChip track={track} /></strong>
              <small>{track.points.length.toLocaleString('fr-FR')} points</small>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
