/** A round reconstructed after it was played. Points the player drops on the map are manual.
 *  A distance between those points, or a distance typed without a point, is estimated.
 *  Nothing here is a GPS fix and nothing here is a strokes-gained baseline. */
import { haversine, validLatLng } from "./geo";

export type ManualSource = "manual" | "estimated" | "unknown";
export type DistanceKind = "estimated" | "unknown" | "manual";

export type PlacedShot = {
  lat: number | null;
  lng: number | null;
  source: ManualSource;
  end_lat: number | null;
  end_lng: number | null;
  end_source: "manual" | null;
  distance_m: number | null;
  distance_kind: DistanceKind;
  penalty_strokes: number;
  position_label: string;
  distance_label: string;
};

export class ReconstructInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReconstructInputError";
  }
}

export function placeShot(input: {
  lat?: unknown; lng?: unknown; end_lat?: unknown; end_lng?: unknown; distance_m?: unknown; distance_kind?: unknown; penalty_strokes?: unknown;
}): PlacedShot {
  const start = validLatLng(input.lat, input.lng);
  const end = validLatLng(input.end_lat, input.end_lng);
  const penalty = penaltyOf(input.penalty_strokes);
  if (start && end) {
    if (input.distance_kind === "manual") {
      const typed = typedPutt(input.distance_m);
      if (typed == null) throw new ReconstructInputError("El putt a mano tiene que estar entre 0,1 y 50 metros");
      return pack(start, "manual", end, typed, "manual", penalty);
    }
    const distance = Math.round(haversine(start, end) * 10) / 10;
    return pack(start, "manual", end, distance, "estimated", penalty);
  }
  if (start) return pack(start, "manual", null, null, "unknown", penalty);
  if (end) return pack(null, "unknown", end, null, "unknown", penalty);
  const typed = typedDistance(input.distance_m);
  if (typed != null) return pack(null, "estimated", null, typed, "estimated", penalty);
  return pack(null, "unknown", null, null, "unknown", penalty);
}

export function positionLabel(source: string | null, hasPoint: boolean): string {
  if (source === "gps") return "GPS";
  if (source === "manual" && hasPoint) return "Marcado a mano";
  if (source === "estimated") return "Distancia estimada, sin punto en el mapa";
  return "Sin ubicación";
}

export function distanceLabel(kind: string | null, meters: number | null): string {
  if (kind === "measured" && meters != null) return "Medida";
  if (kind === "manual" && meters != null) return "A mano";
  if (kind === "estimated" && meters != null) return "Distancia estimada";
  return "Sin distancia";
}

function penaltyOf(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 4) throw new ReconstructInputError("Las penas van de 0 a 4");
  return n;
}

function typedDistance(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 600) throw new ReconstructInputError("La distancia estimada tiene que estar entre 1 y 600 metros");
  return Math.round(n * 10) / 10;
}

function typedPutt(value: unknown): number | null {
  if (typeof value === "number") return value >= 0.1 && value <= 50 ? Math.round(value * 10) / 10 : null;
  if (typeof value !== "string") return null;
  const text = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0.1 || n > 50) return null;
  return Math.round(n * 10) / 10;
}

function pack(
  start: { lat: number; lng: number } | null,
  source: ManualSource,
  end: { lat: number; lng: number } | null,
  distance: number | null,
  kind: DistanceKind,
  penalty: number,
): PlacedShot {
  const marked = !!start || !!end;
  const stored: ManualSource = start ? source : marked ? "manual" : source;
  return {
    lat: start?.lat ?? null,
    lng: start?.lng ?? null,
    source: stored,
    end_lat: end?.lat ?? null,
    end_lng: end?.lng ?? null,
    end_source: end ? "manual" : null,
    distance_m: distance,
    distance_kind: kind,
    penalty_strokes: penalty,
    position_label: marked ? "Marcado a mano" : positionLabel(stored, false),
    distance_label: distanceLabel(kind, distance),
  };
}
