import type { VesselTrackPoint } from './types';

export const MOROCCO_CENTER: [number, number] = [29.7, -8.8];

export const DEFAULT_MOROCCO_BOUNDS: [[number, number], [number, number]] = [
  [20.5, -18.5],
  [36.5, -0.5],
];

export function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function computeBounds(points: VesselTrackPoint[]): [[number, number], [number, number]] {
  if (!points.length) return DEFAULT_MOROCCO_BOUNDS;
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
  const latSpan = bounds[1][0] - bounds[0][0];
  const lngSpan = bounds[1][1] - bounds[0][1];
  if (latSpan < 0.12 && lngSpan < 0.12) {
    return [
      [bounds[0][0] - 0.08, bounds[0][1] - 0.08],
      [bounds[1][0] + 0.08, bounds[1][1] + 0.08],
    ];
  }
  return bounds;
}

export function bearing(from: Pick<VesselTrackPoint, 'lat' | 'lng'>, to: Pick<VesselTrackPoint, 'lat' | 'lng'>): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const deltaLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function interpolatePosition(
  from: Pick<VesselTrackPoint, 'lat' | 'lng'>,
  to: Pick<VesselTrackPoint, 'lat' | 'lng'>,
  ratio: number
): [number, number] {
  const clamped = Math.max(0, Math.min(1, ratio));
  return [
    from.lat + (to.lat - from.lat) * clamped,
    from.lng + (to.lng - from.lng) * clamped,
  ];
}
