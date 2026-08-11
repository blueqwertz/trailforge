import { cumulativeDistances, haversineDistance, type LngLat, type Route } from '@trailforge/core';

/**
 * Geometrische Hilfen für die Kartenbedienung.
 *
 * Alle Funktionen arbeiten auf der bereits berechneten Route, nicht auf der
 * Karte — so bleiben sie ohne Karteninstanz prüfbar.
 */

/** Index des Routenpunktes, der einem Ort am nächsten liegt. */
export function nearestPointIndex(points: readonly LngLat[], target: LngLat): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < points.length; i++) {
    const distance = haversineDistance(points[i]!, target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Ordnet jedem gesetzten Wegpunkt den nächstgelegenen Routenpunkt zu.
 *
 * Die Route verläuft durch die Wegpunkte, trifft sie aber nicht exakt: BRouter
 * rastet sie auf den nächsten Weg ein.
 */
export function waypointAnchors(route: Route): number[] {
  return route.waypoints.map((waypoint) => nearestPointIndex(route.points, waypoint));
}

/**
 * An welcher Stelle der Wegpunktliste ein Klick auf die Route einzufügen ist.
 *
 * Ein Klick zwischen dem ersten und zweiten Wegpunkt ergibt Index 1, also ein
 * Zwischenziel direkt nach dem Start.
 */
export function insertIndexFor(route: Route, pointIndex: number): number {
  const anchors = waypointAnchors(route);

  let index = 1;
  for (let i = 1; i < anchors.length; i++) {
    if (pointIndex >= anchors[i]!) index = i + 1;
  }

  return Math.min(index, route.waypoints.length);
}

export interface PointOnRoute {
  point: LngLat & { ele: number };
  index: number;
  distance: number;
}

/** Punkt in einer bestimmten Entfernung vom Start, für den Abgleich mit dem Höhenprofil. */
export function pointAtDistance(route: Route, distance: number): PointOnRoute | null {
  if (route.points.length === 0) return null;

  const distances = cumulativeDistances(route.points);
  const total = distances[distances.length - 1] ?? 0;
  const target = Math.min(Math.max(0, distance), total);

  let index = 0;
  while (index < distances.length - 1 && distances[index + 1]! < target) index++;

  return { point: route.points[index]!, index, distance: distances[index] ?? 0 };
}

/** Entfernung vom Start bis zu einem Routenpunkt. */
export function distanceAtIndex(route: Route, index: number): number {
  const distances = cumulativeDistances(route.points);
  return distances[Math.min(Math.max(0, index), distances.length - 1)] ?? 0;
}

export function routeToGeoJson(route: Route) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: route.points.map((point) => [point.lng, point.lat]),
    },
  };
}

/** Umschließendes Rechteck einer Route als [[west, süd], [ost, nord]]. */
export function routeBounds(route: Route): [[number, number], [number, number]] | null {
  const first = route.points[0];
  if (!first) return null;

  let west = first.lng;
  let east = first.lng;
  let south = first.lat;
  let north = first.lat;

  for (const point of route.points) {
    if (point.lng < west) west = point.lng;
    if (point.lng > east) east = point.lng;
    if (point.lat < south) south = point.lat;
    if (point.lat > north) north = point.lat;
  }

  return [
    [west, south],
    [east, north],
  ];
}
