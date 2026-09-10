import * as maplibregl from 'maplibre-gl';
import type {
  GeoJSONSource,
  LngLatBoundsLike,
  Map as MapLibreMap,
} from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { computeBounds, DEFAULT_MOROCCO_BOUNDS, MOROCCO_CENTER } from '../../lib/vesselMap/geoUtils';
import type { AnimatedVesselState, VesselTrack } from '../../lib/vesselMap/types';
import { formatDateTime } from '../../lib/vesselMap/timeUtils';

type Props = {
  tracks: VesselTrack[];
  states: AnimatedVesselState[];
  selectedId: string | null;
  onSelect: (id: string, state?: AnimatedVesselState) => void;
};

const WORLDVIEW = 'MA';
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const FULL_TRACKS_SOURCE = 'vessel-full-tracks';
const TRAVELLED_SOURCE = 'vessel-travelled-tracks';
const MARKERS_SOURCE = 'vessel-markers';
const MARKER_RINGS_LAYER = 'vessel-marker-rings';
const ENDPOINTS_SOURCE = 'vessel-endpoints';

const MOROCCO_UNIFIED_OUTLINE: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: 'Feature',
  properties: { name: 'Morocco', worldview: WORLDVIEW },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [-5.35, 35.92],
      [-3.95, 35.32],
      [-2.92, 35.12],
      [-1.05, 34.72],
      [-1.70, 32.65],
      [-2.65, 31.15],
      [-3.55, 29.95],
      [-4.65, 28.90],
      [-6.20, 27.75],
      [-8.65, 27.70],
      [-9.78, 26.86],
      [-11.45, 25.30],
      [-12.80, 23.90],
      [-13.15, 22.60],
      [-14.35, 21.85],
      [-17.05, 20.75],
      [-15.70, 22.35],
      [-14.45, 24.00],
      [-13.25, 26.15],
      [-12.22, 28.00],
      [-11.10, 29.20],
      [-10.25, 30.30],
      [-9.70, 31.35],
      [-9.05, 32.20],
      [-8.18, 33.05],
      [-7.20, 33.85],
      [-6.25, 34.55],
      [-5.35, 35.92],
    ]],
  },
};

function boundsToMapLibre(bounds: [[number, number], [number, number]]): LngLatBoundsLike {
  return [[bounds[0][1], bounds[0][0]], [bounds[1][1], bounds[1][0]]];
}

function toFeatureCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

function updateSource(map: MapLibreMap, id: string, data: GeoJSON.FeatureCollection) {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  if (source) source.setData(data);
}

function vesselSourcesReady(map: MapLibreMap) {
  return Boolean(
    map.getSource(FULL_TRACKS_SOURCE) &&
    map.getSource(TRAVELLED_SOURCE) &&
    map.getSource(MARKERS_SOURCE) &&
    map.getSource(ENDPOINTS_SOURCE)
  );
}

function styleReadyForAppLayers(map: MapLibreMap) {
  return Boolean(map.getStyle()?.layers?.length);
}

function applyMoroccanWorldviewStyle(map: MapLibreMap) {
  const administrativeLabelPattern = /^label_(country|state|province|region)(_|$)/i;
  const boundaryLayerPattern = /(^|_)boundary(_|$)|(^|_)disputed(_|$)|(^|_)admin(_|$)/i;

  map.getStyle()?.layers?.forEach((layer) => {
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : '';
    const isBoundaryLayer = sourceLayer === 'boundary' || boundaryLayerPattern.test(layer.id);
    const isBroadAdministrativeLabel =
      layer.type === 'symbol' &&
      sourceLayer === 'place' &&
      administrativeLabelPattern.test(layer.id);

    if (isBoundaryLayer || isBroadAdministrativeLabel) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  });
}

function ensureMoroccoWorldviewOverlay(map: MapLibreMap) {
  if (!map.getSource('moroccoUnified')) {
    map.addSource('moroccoUnified', { type: 'geojson', data: MOROCCO_UNIFIED_OUTLINE });
  }

  if (!map.getLayer('morocco-unified-fill')) {
    map.addLayer({
      id: 'morocco-unified-fill',
      type: 'fill',
      source: 'moroccoUnified',
      paint: { 'fill-color': '#f7f0dc', 'fill-opacity': 0.1 },
    });
  }

  if (map.getLayer('morocco-unified-line')) map.removeLayer('morocco-unified-line');
}

function ensureVesselSources(map: MapLibreMap) {
  if (!map.getSource(FULL_TRACKS_SOURCE)) {
    map.addSource(FULL_TRACKS_SOURCE, { type: 'geojson', data: toFeatureCollection([]) });
    map.addLayer({
      id: FULL_TRACKS_SOURCE,
      type: 'line',
      source: FULL_TRACKS_SOURCE,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['case', ['boolean', ['get', 'selected'], false], 4, 2.2],
        'line-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.88, 0.42],
      },
    });
  }

  if (!map.getSource(TRAVELLED_SOURCE)) {
    map.addSource(TRAVELLED_SOURCE, { type: 'geojson', data: toFeatureCollection([]) });
    map.addLayer({
      id: TRAVELLED_SOURCE,
      type: 'line',
      source: TRAVELLED_SOURCE,
      paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.92 },
    });
  }

  if (!map.getSource(ENDPOINTS_SOURCE)) {
    map.addSource(ENDPOINTS_SOURCE, { type: 'geojson', data: toFeatureCollection([]) });
    map.addLayer({
      id: ENDPOINTS_SOURCE,
      type: 'circle',
      source: ENDPOINTS_SOURCE,
      paint: {
        'circle-radius': ['case', ['==', ['get', 'kind'], 'start'], 4, 4.8],
        'circle-color': ['case', ['==', ['get', 'kind'], 'start'], '#ffffff', ['get', 'color']],
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': 2,
      },
    });
  }

  if (!map.getSource(MARKERS_SOURCE)) {
    map.addSource(MARKERS_SOURCE, { type: 'geojson', data: toFeatureCollection([]) });
  }

  if (!map.getLayer(MARKER_RINGS_LAYER)) {
    map.addLayer({
      id: MARKER_RINGS_LAYER,
      type: 'circle',
      source: MARKERS_SOURCE,
      paint: {
        'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 18, 15],
        'circle-color': '#ffffff',
        'circle-opacity': 0.98,
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 3.4, 2.4],
      },
    });
  }

  if (!map.getLayer(MARKERS_SOURCE)) {
    map.addLayer({
      id: MARKERS_SOURCE,
      type: 'symbol',
      source: MARKERS_SOURCE,
      layout: {
        'icon-image': 'vessel-arrow',
        'icon-size': ['case', ['boolean', ['get', 'selected'], false], 0.82, 0.7],
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
      },
      paint: {
        'icon-color': ['get', 'color'],
      },
    });
  }
}

function addBoatImage(map: MapLibreMap) {
  if (map.hasImage('vessel-arrow')) return;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#000000';
  context.beginPath();
  context.moveTo(32, 8);
  context.lineTo(49, 54);
  context.lineTo(32, 45);
  context.lineTo(15, 54);
  context.closePath();
  context.fill();
  map.addImage('vessel-arrow', context.getImageData(0, 0, size, size), { sdf: true });
}

function fullTrackFeatures(tracks: VesselTrack[], selectedId: string | null): GeoJSON.Feature[] {
  return tracks
    .filter((track) => track.points.length > 1)
    .map((track) => ({
      type: 'Feature',
      properties: { id: track.id, color: track.color, selected: track.id === selectedId },
      geometry: { type: 'LineString', coordinates: track.points.map((point) => [point.lng, point.lat]) },
    } as GeoJSON.Feature));
}

function endpointFeatures(tracks: VesselTrack[]): GeoJSON.Feature[] {
  return tracks.flatMap((track) => {
    const first = track.points[0];
    const last = track.points[track.points.length - 1];
    if (!first || !last) return [];
    return [
      {
        type: 'Feature',
        properties: { id: track.id, kind: 'start', color: track.color },
        geometry: { type: 'Point', coordinates: [first.lng, first.lat] },
      },
      {
        type: 'Feature',
        properties: { id: track.id, kind: 'end', color: track.color },
        geometry: { type: 'Point', coordinates: [last.lng, last.lat] },
      },
    ] as GeoJSON.Feature[];
  });
}

function markerFeatures(states: AnimatedVesselState[], selectedId: string | null): GeoJSON.Feature[] {
  return states.map((state) => ({
    type: 'Feature',
    properties: {
      id: state.track.id,
      color: state.track.color,
      heading: state.heading ?? 0,
      selected: state.track.id === selectedId,
    },
    geometry: { type: 'Point', coordinates: [state.position[1], state.position[0]] },
  } as GeoJSON.Feature));
}

function travelledFeatures(states: AnimatedVesselState[]): GeoJSON.Feature[] {
  return states
    .filter((state) => state.travelledPoints.length > 0)
    .map((state) => ({
      type: 'Feature',
      properties: { id: state.track.id, color: state.track.color },
      geometry: {
        type: 'LineString',
        coordinates: [
          ...state.travelledPoints.map((point) => [point.lng, point.lat]),
          [state.position[1], state.position[0]],
        ],
      },
    } as GeoJSON.Feature));
}

function popupHtml(state: AnimatedVesselState) {
  const point = state.point;
  return `
    <div class="maplibre-vessel-popup">
      <strong>${point.vesselName || state.track.name}</strong>
      <span>Voyage: ${point.trip}</span>
      <span>Date: ${formatDateTime(point.time)}</span>
      <span>Position: ${state.position[0].toFixed(5)}, ${state.position[1].toFixed(5)}</span>
      <span>Vitesse: ${point.speed == null ? '-' : `${point.speed} m/s`}</span>
      <span>IMEI: ${point.imei || '-'}</span>
      <span>Immatriculation: ${point.registration || '-'}</span>
    </div>
  `;
}

export default function MapView({ tracks, states, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const tracksRef = useRef(tracks);
  const statesRef = useRef(states);
  const selectedIdRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    tracksRef.current = tracks;
    statesRef.current = states;
    selectedIdRef.current = selectedId;
    onSelectRef.current = onSelect;
  }, [tracks, states, selectedId, onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [MOROCCO_CENTER[1], MOROCCO_CENTER[0]],
      zoom: 4.4,
      minZoom: 3,
      maxZoom: 18,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    mapRef.current = map;

    let appLayersInitialized = false;
    const initializeAppLayers = () => {
      if (appLayersInitialized || !styleReadyForAppLayers(map)) return;
      appLayersInitialized = true;
      applyMoroccanWorldviewStyle(map);
      ensureMoroccoWorldviewOverlay(map);
      addBoatImage(map);
      ensureVesselSources(map);
      updateSource(map, FULL_TRACKS_SOURCE, toFeatureCollection(fullTrackFeatures(tracksRef.current, selectedIdRef.current)));
      updateSource(map, ENDPOINTS_SOURCE, toFeatureCollection(endpointFeatures(tracksRef.current)));
      updateSource(map, MARKERS_SOURCE, toFeatureCollection(markerFeatures(statesRef.current, selectedIdRef.current)));
      updateSource(map, TRAVELLED_SOURCE, toFeatureCollection(travelledFeatures(statesRef.current)));
      map.fitBounds(boundsToMapLibre(DEFAULT_MOROCCO_BOUNDS), { padding: 40, maxZoom: 6, duration: 0 });
      setTimeout(() => map.resize(), 120);
    };

    map.on('styledata', initializeAppLayers);
    map.on('load', initializeAppLayers);
    const initializationTimers = [0, 300, 1000, 2500, 5000, 8000, 12000].map((delay) =>
      window.setTimeout(initializeAppLayers, delay)
    );

    const handleMarkerClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (!id) return;
      const state = statesRef.current.find((item) => item.track.id === id);
      if (!state) return;
      onSelectRef.current(id, state);
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
        .setLngLat([state.position[1], state.position[0]])
        .setHTML(popupHtml(state))
        .addTo(map);
    };

    map.on('click', MARKERS_SOURCE, handleMarkerClick);
    map.on('click', MARKER_RINGS_LAYER, handleMarkerClick);

    const setPointerCursor = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const resetCursor = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('mouseenter', MARKERS_SOURCE, setPointerCursor);
    map.on('mouseenter', MARKER_RINGS_LAYER, setPointerCursor);
    map.on('mouseleave', MARKERS_SOURCE, resetCursor);
    map.on('mouseleave', MARKER_RINGS_LAYER, resetCursor);

    return () => {
      popupRef.current?.remove();
      map.off('styledata', initializeAppLayers);
      map.off('load', initializeAppLayers);
      map.off('click', MARKERS_SOURCE, handleMarkerClick);
      map.off('click', MARKER_RINGS_LAYER, handleMarkerClick);
      map.off('mouseenter', MARKERS_SOURCE, setPointerCursor);
      map.off('mouseenter', MARKER_RINGS_LAYER, setPointerCursor);
      map.off('mouseleave', MARKERS_SOURCE, resetCursor);
      map.off('mouseleave', MARKER_RINGS_LAYER, resetCursor);
      initializationTimers.forEach((timer) => window.clearTimeout(timer));
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const timers = [80, 250, 600].map((delay) => window.setTimeout(() => map.resize(), delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const refreshTracks = () => {
      if (!vesselSourcesReady(map)) ensureVesselSources(map);
      updateSource(map, FULL_TRACKS_SOURCE, toFeatureCollection(fullTrackFeatures(tracks, selectedId)));
      updateSource(map, ENDPOINTS_SOURCE, toFeatureCollection(endpointFeatures(tracks)));
    };
    if (vesselSourcesReady(map)) {
      refreshTracks();
      return undefined;
    }
    if (styleReadyForAppLayers(map)) {
      refreshTracks();
      return undefined;
    }
    map.once('styledata', refreshTracks);
    map.once('load', refreshTracks);
    return () => {
      map.off('styledata', refreshTracks);
      map.off('load', refreshTracks);
    };
  }, [tracks, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const refreshAnimation = () => {
      if (!vesselSourcesReady(map)) ensureVesselSources(map);
      updateSource(map, MARKERS_SOURCE, toFeatureCollection(markerFeatures(states, selectedId)));
      updateSource(map, TRAVELLED_SOURCE, toFeatureCollection(travelledFeatures(states)));
    };
    if (vesselSourcesReady(map)) {
      refreshAnimation();
    } else if (styleReadyForAppLayers(map)) {
      refreshAnimation();
    } else {
      map.once('styledata', refreshAnimation);
      map.once('load', refreshAnimation);
    }

    if (selectedId && popupRef.current) {
      const state = states.find((item) => item.track.id === selectedId);
      if (state) {
        popupRef.current.setLngLat([state.position[1], state.position[0]]).setHTML(popupHtml(state));
      }
    }
    return () => {
      map.off('styledata', refreshAnimation);
      map.off('load', refreshAnimation);
    };
  }, [states, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const points = tracks.flatMap((track) => track.points);
    const bounds = boundsToMapLibre(computeBounds(points));
    const timer = window.setTimeout(() => {
      map.resize();
      map.fitBounds(bounds, { padding: 40, maxZoom: points.length ? 10 : 6, duration: 500 });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [tracks]);

  function recenter() {
    const map = mapRef.current;
    if (!map) return;
    const points = tracks.flatMap((track) => track.points);
    map.resize();
    map.fitBounds(boundsToMapLibre(computeBounds(points)), { padding: 40, maxZoom: points.length ? 10 : 6, duration: 500 });
  }

  return (
    <div className="vessel-map-frame">
      <button type="button" className="maplibre-recenter-btn" onClick={recenter} title="Recentrer sur la carte">
        ⦿
      </button>
      <div ref={containerRef} className="vessel-maplibre-map" />
    </div>
  );
}
