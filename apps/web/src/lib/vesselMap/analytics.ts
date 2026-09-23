import { timeMs } from './timeUtils';
import type { VesselTrack, VesselTrackPoint } from './types';

const EARTH_RADIUS_KM = 6371;

export function segmentDistanceKm(from: VesselTrackPoint, to: VesselTrackPoint): number {
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const deltaLat = (to.lat - from.lat) * Math.PI / 180;
  const deltaLng = (to.lng - from.lng) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function trackDistanceKm(track: VesselTrack): number {
  return track.points.slice(1).reduce((total, point, index) => total + segmentDistanceKm(track.points[index], point), 0);
}

export function fleetAnalytics(tracks: VesselTrack[]) {
  const points = tracks.flatMap((track) => track.points);
  const timedPoints = points.filter((point) => timeMs(point.time) != null);
  const speeds = points.map((point) => point.speed).filter((speed): speed is number => speed != null && speed >= 0);
  const distances = tracks.map(trackDistanceKm);
  const mobileVessels = distances.filter((distance) => distance >= 0.5).length;
  const totalDistanceKm = distances.reduce((sum, distance) => sum + distance, 0);
  const meanSpeedMs = speeds.length ? speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length : null;
  const maxSpeedMs = speeds.length ? Math.max(...speeds) : null;

  return {
    totalDistanceKm,
    mobileVessels,
    stationaryVessels: Math.max(0, tracks.length - mobileVessels),
    meanSpeedMs,
    maxSpeedMs,
    temporalCoverage: points.length ? Math.round((timedPoints.length / points.length) * 100) : 0,
    observationDensity: tracks.length ? Math.round(points.length / tracks.length) : 0,
  };
}
