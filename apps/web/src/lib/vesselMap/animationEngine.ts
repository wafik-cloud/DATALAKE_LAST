import { bearing, interpolatePosition } from './geoUtils';
import { timeMs } from './timeUtils';
import type { AnimatedVesselState, VesselTrack, VesselTrackPoint } from './types';

export function globalTimeRange(tracks: VesselTrack[]): { min: number; max: number } {
  const values = tracks.flatMap((track) => track.points.map((point) => timeMs(point.time)).filter((value): value is number => value != null));
  if (!values.length) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max: max > min ? max : min + 1 };
}

export function pointAtTrackTime(track: VesselTrack, currentTime: number): AnimatedVesselState | null {
  const points = track.points;
  if (!points.length) return null;
  if (points.length === 1) {
    return { track, point: points[0], position: [points[0].lat, points[0].lng], heading: points[0].heading, travelledPoints: points };
  }

  const timed = points.map((point, index) => ({ point, index, ms: timeMs(point.time) }));
  if (timed.every((item) => item.ms == null)) {
    const progress = Math.max(0, Math.min(1, currentTime));
    const exactIndex = progress * (points.length - 1);
    const index = Math.min(points.length - 2, Math.floor(exactIndex));
    const ratio = exactIndex - index;
    const from = points[index];
    const to = points[index + 1];
    return {
      track,
      point: from,
      position: interpolatePosition(from, to, ratio),
      heading: from.heading ?? bearing(from, to),
      travelledPoints: points.slice(0, index + 1),
    };
  }

  const firstTimed = timed.find((item) => item.ms != null);
  const lastTimed = timed.slice().reverse().find((item) => item.ms != null);
  if (!firstTimed || !lastTimed) return null;
  if (currentTime <= firstTimed.ms!) {
    return { track, point: firstTimed.point, position: [firstTimed.point.lat, firstTimed.point.lng], heading: firstTimed.point.heading, travelledPoints: [firstTimed.point] };
  }
  if (currentTime >= lastTimed.ms!) {
    return { track, point: lastTimed.point, position: [lastTimed.point.lat, lastTimed.point.lng], heading: lastTimed.point.heading, travelledPoints: points };
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const fromMs = timeMs(from.time);
    const toMs = timeMs(to.time);
    if (fromMs == null || toMs == null || toMs < fromMs) continue;
    if (currentTime >= fromMs && currentTime <= toMs) {
      const ratio = toMs === fromMs ? 1 : (currentTime - fromMs) / (toMs - fromMs);
      return {
        track,
        point: from,
        position: interpolatePosition(from, to, ratio),
        heading: from.heading ?? bearing(from, to),
        travelledPoints: points.slice(0, index + 1),
      };
    }
  }

  const nearest = timed.reduce((best, item) => {
    if (item.ms == null) return best;
    return Math.abs(item.ms - currentTime) < Math.abs((best.ms || 0) - currentTime) ? item : best;
  }, firstTimed);

  return { track, point: nearest.point, position: [nearest.point.lat, nearest.point.lng], heading: nearest.point.heading, travelledPoints: points.slice(0, nearest.index + 1) };
}

export function pointAtTrackProgress(track: VesselTrack, progress: number): AnimatedVesselState | null {
  return pointAtTrackTime(track, Math.max(0, Math.min(1, progress)));
}
