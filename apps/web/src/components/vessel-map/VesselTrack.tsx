import type { VesselTrack as VesselTrackModel } from '../../lib/vesselMap/types';

export default function VesselTrack({ track }: { track: VesselTrackModel }) {
  return (
    <span className="vessel-track-chip">
      <i style={{ background: track.color }} />
      {track.name}
    </span>
  );
}
