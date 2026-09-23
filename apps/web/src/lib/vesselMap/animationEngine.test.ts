import { describe, expect, it } from 'vitest';
import { pointAtTrackProgress } from './animationEngine';
import type { VesselTrack } from './types';

const track: VesselTrack = {
  id: 'v1', name: 'Vessel 1', color: '#000',
  metadata: { vesselName: null, registration: null, boatId: null, deviceId: null, imei: null },
  points: [
    { vessel: 'v1', trip: 't1', lat: 30, lng: -10, time: '2026-01-01T00:00:00Z', speed: 1, heading: null },
    { vessel: 'v1', trip: 't1', lat: 31, lng: -9, time: '2026-01-01T12:00:00Z', speed: 2, heading: null },
    { vessel: 'v1', trip: 't1', lat: 32, lng: -8, time: '2026-01-02T00:00:00Z', speed: 3, heading: null },
  ],
};

describe('pointAtTrackProgress', () => {
  it('normalizes a timed trajectory over the full playback duration', () => {
    expect(pointAtTrackProgress(track, 0.25)?.position).toEqual([30.5, -9.5]);
    expect(pointAtTrackProgress(track, 0.75)?.position).toEqual([31.5, -8.5]);
  });
});
