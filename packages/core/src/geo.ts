import type { LngLat, RoutePoint } from './types';

const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Entfernung zweier Punkte in Metern nach der Haversine-Formel. */
export function haversineDistance(a: LngLat, b: LngLat): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b.lng - a.lng);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Aufsummierte Distanz vom Start bis zu jedem Punkt, in Metern.
 * Das Ergebnis hat dieselbe Länge wie die Eingabe und beginnt mit 0.
 */
export function cumulativeDistances(points: readonly LngLat[]): number[] {
  const result = new Array<number>(points.length);
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      total += haversineDistance(points[i - 1]!, points[i]!);
    }
    result[i] = total;
  }
  return result;
}

/**
 * Glättet das Höhenprofil mit einem gleitenden Mittel über ein Distanzfenster.
 *
 * Die Höhendaten stammen aus SRTM und rauschen um mehrere Meter. Ungeglättet
 * summieren sich diese Sprünge zu absurden Höhenmetern auf — bei einer flachen
 * 23-km-Strecke durch München ergibt die rohe Summe 105 Höhenmeter, tatsächlich
 * sind es 9. Für Steigungsklassen und die Profilkurve wird deshalb geglättet;
 * die ausgewiesenen Höhenmeter kommen direkt von BRouter, das intern denselben
 * Effekt herausfiltert.
 */
export function smoothElevation(points: readonly RoutePoint[], windowMeters = 60): number[] {
  const distances = cumulativeDistances(points);
  const smoothed = new Array<number>(points.length);
  const half = windowMeters / 2;

  let start = 0;
  let end = 0;
  let sum = 0;

  for (let i = 0; i < points.length; i++) {
    const from = distances[i]! - half;
    const to = distances[i]! + half;

    while (end < points.length && distances[end]! <= to) {
      sum += points[end]!.ele;
      end++;
    }
    while (distances[start]! < from) {
      sum -= points[start]!.ele;
      start++;
    }

    const count = end - start;
    smoothed[i] = count > 0 ? sum / count : points[i]!.ele;
  }

  return smoothed;
}

/** Umschließendes Rechteck als [westen, süden, osten, norden]. */
export function boundingBox(points: readonly LngLat[]): [number, number, number, number] | null {
  const first = points[0];
  if (!first) return null;

  let west = first.lng;
  let east = first.lng;
  let south = first.lat;
  let north = first.lat;

  for (const point of points) {
    if (point.lng < west) west = point.lng;
    if (point.lng > east) east = point.lng;
    if (point.lat < south) south = point.lat;
    if (point.lat > north) north = point.lat;
  }

  return [west, south, east, north];
}
