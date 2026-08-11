import { cumulativeDistances, smoothElevation } from './geo';
import type { RoutePoint, RouteSegment, Sport } from './types';

/**
 * Einheitliche Zeitschätzung für alle Kandidaten.
 *
 * BRouter liefert zwar eine Fahrzeit mit, aber jedes Profil rechnet mit einem
 * eigenen kinematischen Modell. Gemessen an denselben zwei Punkten in München
 * meldet `shortest` 251 Minuten für 21,2 km, `trekking` 64 Minuten für 23,3 km.
 * Diese Werte gegeneinander zu stellen wäre unsinnig — die Präferenz
 * „schnellste" würde damit systematisch das Profil mit dem optimistischsten
 * Modell wählen statt die schnellste Strecke.
 *
 * Deshalb wird hier für jeden Kandidaten mit demselben Modell gerechnet:
 * Geschwindigkeit aus Steigung, Untergrund und Sportart.
 */

/** Ebene Geschwindigkeit auf Asphalt in Metern pro Sekunde. */
const BASE_SPEED: Record<Sport, number> = {
  hiking: 4.8 / 3.6,
  running: 10.5 / 3.6,
  road: 26 / 3.6,
  mtb: 17 / 3.6,
};

/**
 * Untergrund-Faktoren. Auf Schotter verliert ein Rennrad deutlich mehr als ein
 * Wanderer, deshalb je Sportart eigene Werte.
 */
const SURFACE_FACTOR: Record<Sport, Record<string, number>> = {
  hiking: { paved: 1, compacted: 0.97, natural: 0.88, unknown: 0.95 },
  running: { paved: 1, compacted: 0.96, natural: 0.85, unknown: 0.94 },
  road: { paved: 1, compacted: 0.72, natural: 0.5, unknown: 0.9 },
  mtb: { paved: 1, compacted: 0.9, natural: 0.75, unknown: 0.92 },
};

/** Treppen kosten unabhängig von der Sportart massiv Zeit. */
const STEPS_FACTOR = 0.35;

const isFootSport = (sport: Sport): boolean => sport === 'hiking' || sport === 'running';

/**
 * Geschwindigkeitsfaktor nach Steigung.
 *
 * Zu Fuß nach Toblers Wanderfunktion, die ihr Maximum bei leichtem Gefälle hat
 * und für Steigungen wie Gefälle abfällt. Auf dem Rad exponentiell fallend
 * bergauf, bergab begrenzt gewinnend — irgendwann bremst man.
 */
function gradientFactor(sport: Sport, gradient: number): number {
  if (isFootSport(sport)) {
    // Tobler, auf 1 bei ebenem Gelände normiert.
    const tobler = Math.exp(-3.5 * Math.abs(gradient + 0.05));
    const flat = Math.exp(-3.5 * 0.05);
    return tobler / flat;
  }

  if (gradient >= 0) return Math.exp(-14 * gradient);
  return Math.min(1.7, Math.exp(-6 * gradient));
}

export interface DurationInput {
  points: readonly RoutePoint[];
  segments: readonly RouteSegment[];
  sport: Sport;
  /** Untergrundklasse je Wegstück, in derselben Reihenfolge wie `segments`. */
  surfaceClasses: readonly string[];
  /** Ob das Wegstück eine Treppe ist. */
  stepFlags: readonly boolean[];
}

/** Geschätzte Dauer in Sekunden. */
export function estimateDuration(input: DurationInput): number {
  const { points, segments, sport, surfaceClasses, stepFlags } = input;
  if (points.length < 2 || segments.length === 0) return 0;

  const smoothed = smoothElevation(points);
  const distances = cumulativeDistances(points);
  const surfaceFactors = SURFACE_FACTOR[sport];
  const baseSpeed = BASE_SPEED[sport];

  let seconds = 0;
  let previousIndex = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const length = segment.distance;
    if (length <= 0) continue;

    const endIndex = Math.min(segment.pointIndex, points.length - 1);
    const gradient = segmentGradient(smoothed, distances, previousIndex, endIndex);
    previousIndex = endIndex;

    const surfaceFactor = surfaceFactors[surfaceClasses[i] ?? 'unknown'] ?? 0.9;
    const stepFactor = stepFlags[i] ? STEPS_FACTOR : 1;

    const speed = baseSpeed * surfaceFactor * stepFactor * gradientFactor(sport, gradient);
    seconds += length / Math.max(0.3, speed);
  }

  return Math.round(seconds);
}

function segmentGradient(
  elevations: readonly number[],
  distances: readonly number[],
  fromIndex: number,
  toIndex: number,
): number {
  if (toIndex <= fromIndex) return 0;

  const run = distances[toIndex]! - distances[fromIndex]!;
  if (run < 1) return 0;

  const rise = elevations[toIndex]! - elevations[fromIndex]!;
  // Über 40 Prozent geht es nicht mehr um Fahren oder Gehen, sondern um Klettern.
  return Math.max(-0.4, Math.min(0.4, rise / run));
}
