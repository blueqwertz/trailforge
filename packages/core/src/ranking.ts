import type { Preference, Route, RouteResult } from './types.js';

/**
 * Auswahl des besten Kandidaten.
 *
 * „Kürzeste" und „schnellste" sind eindeutig messbar. „Schönste" und
 * „ruhigste" sind es nicht — hier wird der jeweilige Score gegen den Umweg
 * aufgewogen, den er kostet. Ohne diese Bremse gewinnt sonst regelmäßig eine
 * Strecke, die zwar traumhaft verläuft, aber doppelt so lang ist.
 */

/** Ab diesem Umweg gilt der volle Abzug. 0,6 entspricht 60 Prozent mehr Länge. */
const DETOUR_LIMIT = 0.6;

/**
 * Was ein voller Umweg kostet, ausgedrückt als Vielfaches der Spannweite der
 * im Feld erreichbaren Zielwerte.
 *
 * Der Bezug auf die Spannweite ist wesentlich. Ein erster Entwurf hat Zielwert
 * und Umweg in festen absoluten Zahlen gegeneinander gestellt und dadurch
 * systematisch die kürzeste Strecke gewählt: die Verkehrswerte der Kandidaten
 * liegen oft nur wenige Hundertstel auseinander, ein Umweg von zehn Prozent
 * wog dagegen ein Vielfaches davon. Auf einer Testroute München–Ebersberg fiel
 * so die Variante durch, die den Anteil auf großen Straßen von 13 auf 2 Prozent
 * senkte — für elf Prozent mehr Länge.
 *
 * Eine reine Normierung auf 0 bis 1 wäre das andere Extrem: sie verwirft, wie
 * groß der Gewinn überhaupt ist, und ließe bei nur zwei Kandidaten schon einen
 * minimalen Vorsprung jeden Umweg rechtfertigen. Der Abzug bemisst sich
 * deshalb an dem, was im Feld tatsächlich zu holen ist.
 */
const DETOUR_COST_FACTOR = 2;

/** Grenzen, damit weder ein winziger noch ein riesiger Spielraum entgleist. */
const MIN_DETOUR_COST = 0.05;
const MAX_DETOUR_COST = 1;

interface Reference {
  shortestDistance: number;
  fastestDuration: number;
  /** Kleinster und größter Zielwert im Kandidatenfeld. */
  scoreRange: { min: number; max: number };
}

function detourCost(range: { min: number; max: number }): number {
  const spread = Math.max(0, range.max - range.min);
  return Math.min(MAX_DETOUR_COST, Math.max(MIN_DETOUR_COST, spread * DETOUR_COST_FACTOR));
}

function normalizedDetour(distance: number, shortestDistance: number): number {
  if (shortestDistance <= 0) return 0;
  const detour = distance / shortestDistance - 1;
  if (detour <= 0) return 0;
  return Math.min(1, detour / DETOUR_LIMIT);
}

/** Der Zielwert, den eine Präferenz maximieren will. */
export function targetValue(route: Route, preference: Preference): number {
  switch (preference) {
    case 'shortest':
      return -route.metrics.distance;
    case 'fastest':
      return -route.metrics.duration;
    case 'scenic':
      return route.metrics.scenicScore;
    case 'quiet':
      return route.metrics.quietScore;
  }
}

/**
 * Bewertet einen Kandidaten für die gewählte Präferenz. Höher ist besser,
 * damit alle vier Präferenzen dieselbe Sortierung verwenden können.
 *
 * „Kürzeste" und „schnellste" sind für sich eindeutig und brauchen keinen
 * Ausgleich — dort ist die Länge beziehungsweise die Zeit ja gerade das Ziel.
 */
export function scoreRoute(route: Route, preference: Preference, reference: Reference): number {
  if (preference === 'shortest' || preference === 'fastest') {
    return targetValue(route, preference);
  }

  return (
    targetValue(route, preference) -
    detourCost(reference.scoreRange) *
      normalizedDetour(route.metrics.distance, reference.shortestDistance)
  );
}

/**
 * Wirft Kandidaten weg, die praktisch dieselbe Strecke beschreiben.
 *
 * Verschiedene Profile führen oft zum identischen Ergebnis. Solche Dubletten
 * als „Alternative" anzubieten wäre irreführend, deshalb bleibt jeweils nur
 * der bestbewertete Vertreter übrig.
 */
function deduplicate(routes: Route[]): Route[] {
  const seen = new Map<string, Route>();

  for (const route of routes) {
    // 50-Meter-Raster für die Länge plus grober Verlauf über Stützpunkte:
    // zwei Routen gleicher Länge können trotzdem verschieden verlaufen.
    const lengthKey = Math.round(route.metrics.distance / 50);
    const shapeKey = shapeSignature(route);
    const key = `${lengthKey}:${shapeKey}`;

    if (!seen.has(key)) seen.set(key, route);
  }

  return [...seen.values()];
}

/** Grobe Formsignatur aus fünf gleichmäßig verteilten Stützpunkten. */
function shapeSignature(route: Route): string {
  const { points } = route;
  if (points.length === 0) return '';

  const samples: string[] = [];
  for (let i = 0; i < 5; i++) {
    const point = points[Math.floor(((points.length - 1) * i) / 4)]!;
    // Rund 100 Meter Auflösung — feiner wäre gegenüber Rundungen anfällig.
    samples.push(`${point.lng.toFixed(3)},${point.lat.toFixed(3)}`);
  }
  return samples.join('|');
}

/**
 * Sortiert die Kandidaten und liefert Sieger plus Alternativen.
 * Die Reihenfolge ist bei Gleichstand stabil über die Routen-Kennung.
 */
export function rankCandidates(candidates: Route[], preference: Preference): RouteResult {
  const routes = deduplicate(candidates.filter((route) => route.points.length > 1));

  const first = routes[0];
  if (!first) {
    throw new Error('Es gibt keinen einzigen gültigen Routenkandidaten.');
  }

  const targets = routes.map((route) => targetValue(route, preference));
  const reference: Reference = {
    shortestDistance: Math.min(...routes.map((route) => route.metrics.distance)),
    fastestDuration: Math.min(...routes.map((route) => route.metrics.duration || Infinity)),
    scoreRange: { min: Math.min(...targets), max: Math.max(...targets) },
  };

  const scored = routes
    .map((route) => ({ route, score: scoreRoute(route, preference, reference) }))
    .sort((a, b) => b.score - a.score || a.route.id.localeCompare(b.route.id));

  const [best, ...rest] = scored;

  return {
    best: best!.route,
    alternatives: rest.map((entry) => entry.route),
  };
}

/**
 * Worin sich eine Alternative vom Sieger unterscheidet — als Rohwerte, damit
 * die Oberfläche daraus lokalisierte Sätze bauen kann („3,1 km länger,
 * 40 % weniger Verkehr").
 */
export interface RouteComparison {
  distanceDelta: number;
  durationDelta: number;
  ascentDelta: number;
  /** Relative Änderung der Verkehrsbelastung, −1 bis 1. */
  trafficDelta: number;
  /** Relative Änderung des Naturweganteils, −1 bis 1. */
  natureDelta: number;
}

export function compareRoutes(candidate: Route, reference: Route): RouteComparison {
  return {
    distanceDelta: candidate.metrics.distance - reference.metrics.distance,
    durationDelta: candidate.metrics.duration - reference.metrics.duration,
    ascentDelta: candidate.metrics.ascent - reference.metrics.ascent,
    trafficDelta: candidate.metrics.trafficExposure - reference.metrics.trafficExposure,
    natureDelta: candidate.metrics.natureShare - reference.metrics.natureShare,
  };
}
