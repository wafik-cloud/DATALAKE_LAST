export type VesselTrackPoint = {
  vessel: string;
  trip: string;
  lat: number;
  lng: number;
  time: string | null;
  speed: number | null;
  heading: number | null;
  vesselName?: string | null;
  registration?: string | null;
  boatId?: string | null;
  deviceId?: string | null;
  imei?: string | null;
  status?: string | null;
  raw?: Record<string, string>;
};

export type VesselTrack = {
  id: string;
  name: string;
  color: string;
  metadata: {
    vesselName: string | null;
    registration: string | null;
    boatId: string | null;
    deviceId: string | null;
    imei: string | null;
  };
  points: VesselTrackPoint[];
};

export type CsvParseSummary = {
  totalRows: number;
  validRows: number;
  ignoredRows: number;
  vesselCount: number;
  columns: string[];
  points: VesselTrackPoint[];
  tracks: VesselTrack[];
};

export type AnimatedVesselState = {
  track: VesselTrack;
  point: VesselTrackPoint;
  position: [number, number];
  heading: number | null;
  travelledPoints: VesselTrackPoint[];
};
