import { estimateDuration } from './duration.js';
import { cumulativeDistances, smoothElevation } from './geo.js';
import type {
  GradientBuckets,
  RouteMetrics,
  RoutePoint,
  RouteSegment,
  Sport,
  SurfaceBreakdown,
  WayTypeBreakdown,
} from './types.js';

/**
 * Ableitung aller Kennzahlen aus einer BRouter-Antwort.
 *
 * BRouter liefert zu jedem Wegstück die OSM-Tags mit. Damit lassen sich
 * Oberfläche, Wegart, Verkehrsbelastung und Ausschilderung ohne einen
 * einzigen zusätzlichen Netzwerkaufruf bestimmen — das ist die Grundlage
 * dafür, dass „schön" und „ruhig" belegbare Zahlen statt Bauchgefühl sind.
 */

// --- Oberfläche ------------------------------------------------------------

const PAVED_SURFACES = new Set([
  'asphalt',
  'chipseal',
  'concrete',
  'concrete:lanes',
  'concrete:plates',
  'metal',
  'paved',
  'paving_stones',
  'sett',
  'cobblestone',
  'unhewn_cobblestone',
  'wood',
]);

const COMPACTED_SURFACES = new Set([
  'compacted',
  'fine_gravel',
  'gravel',
  'pebblestone',
  'shells',
  'unpaved',
  'woodchips',
]);

const NATURAL_SURFACES = new Set([
  'dirt',
  'earth',
  'grass',
  'grass_paver',
  'ground',
  'ice',
  'mud',
  'rock',
  'sand',
  'snow',
  'stone',
]);

type SurfaceClass = keyof SurfaceBreakdown;

/**
 * Fehlt `surface`, hilft `tracktype` weiter: grade1 ist befestigt,
 * grade2 und grade3 sind wassergebunden, ab grade4 wird es naturbelassen.
 */
const TRACKTYPE_SURFACE: Record<string, SurfaceClass> = {
  grade1: 'paved',
  grade2: 'compacted',
  grade3: 'compacted',
  grade4: 'natural',
  grade5: 'natural',
};

function classifySurface(tags: Readonly<Record<string, string>>): SurfaceClass {
  const surface = tags['surface'];
  if (surface) {
    if (PAVED_SURFACES.has(surface)) return 'paved';
    if (COMPACTED_SURFACES.has(surface)) return 'compacted';
    if (NATURAL_SURFACES.has(surface)) return 'natural';
  }

  const tracktype = tags['tracktype'];
  if (tracktype && TRACKTYPE_SURFACE[tracktype]) return TRACKTYPE_SURFACE[tracktype];

  return 'unknown';
}

// --- Wegart ----------------------------------------------------------------

type WayTypeClass = keyof WayTypeBreakdown;

const ROAD_HIGHWAYS = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'service',
  'road',
]);

const PATH_HIGHWAYS = new Set(['path', 'footway', 'bridleway', 'pedestrian', 'corridor']);

function classifyWayType(tags: Readonly<Record<string, string>>): WayTypeClass {
  const highway = tags['highway'];
  if (!highway) return 'other';
  if (highway === 'cycleway') return 'cycleway';
  if (highway === 'track') return 'track';
  if (highway === 'steps') return 'steps';
  if (PATH_HIGHWAYS.has(highway)) return 'path';
  if (ROAD_HIGHWAYS.has(highway)) return 'road';
  return 'other';
}

// --- Verkehr ---------------------------------------------------------------

/**
 * Grundbelastung je Straßenklasse, 0 bis 1. Die Werte sind bewusst grob:
 * sie sollen Kandidaten derselben Strecke vergleichbar machen, nicht
 * absolute Verkehrszahlen behaupten.
 *
 * Der Abstand zwischen den Klassen ist stark nichtlinear, weil es das
 * Verkehrsaufkommen auch ist. Eine erste Fassung mit gleichmäßigeren Werten
 * hat auf einer Testroute von München nach Ebersberg die falsche Strecke
 * gewählt: eine Route mit 45 Prozent Anteil an Wohn- und Wirtschaftsstraßen,
 * aber nur 2 Prozent auf Tertiär- und Sekundärstraßen, galt als belasteter als
 * eine mit 13 Prozent auf ebendiesen großen Straßen. Wohnstraßen sind für die
 * empfundene Ruhe nahezu bedeutungslos, große Straßen bestimmen sie fast
 * allein.
 */
const HIGHWAY_TRAFFIC: Record<string, number> = {
  motorway: 1,
  motorway_link: 0.9,
  trunk: 0.95,
  trunk_link: 0.85,
  primary: 0.85,
  primary_link: 0.75,
  secondary: 0.65,
  secondary_link: 0.55,
  tertiary: 0.35,
  tertiary_link: 0.3,
  unclassified: 0.1,
  residential: 0.08,
  road: 0.2,
  service: 0.04,
  living_street: 0.02,
  track: 0.01,
};

/** Radinfrastruktur auf einer Straße senkt die empfundene Belastung. */
const CYCLEWAY_RELIEF: Record<string, number> = {
  track: 0.45,
  opposite_track: 0.45,
  lane: 0.75,
  opposite_lane: 0.75,
  share_busway: 0.85,
  shared_lane: 0.9,
};

function segmentTraffic(tags: Readonly<Record<string, string>>, sport: Sport): number {
  const highway = tags['highway'];
  let traffic = highway ? (HIGHWAY_TRAFFIC[highway] ?? 0) : 0;

  // BRouter schätzt für viele Wege eine Verkehrsklasse vor. Wo sie vorliegt,
  // ist sie belastbarer als die reine Straßenklasse.
  const estimated = Number.parseInt(tags['estimated_traffic_class'] ?? '', 10);
  if (Number.isFinite(estimated) && estimated > 0) {
    traffic = Math.max(traffic, Math.min(1, estimated / 6));
  }

  if (traffic === 0) return 0;

  if (tags['bicycle_road'] === 'yes') {
    traffic *= 0.3;
  }

  if (sport === 'road' || sport === 'mtb') {
    const relief = Math.min(
      CYCLEWAY_RELIEF[tags['cycleway'] ?? ''] ?? 1,
      CYCLEWAY_RELIEF[tags['cycleway:both'] ?? ''] ?? 1,
      CYCLEWAY_RELIEF[tags['cycleway:right'] ?? ''] ?? 1,
      CYCLEWAY_RELIEF[tags['cycleway:left'] ?? ''] ?? 1,
    );
    traffic *= relief;
    if (tags['bicycle'] === 'designated') traffic *= 0.8;
  } else if (tags['sidewalk'] && tags['sidewalk'] !== 'no' && tags['sidewalk'] !== 'none') {
    // Zu Fuß trennt ein Gehweg vom Verkehr, ohne ihn verschwinden zu lassen.
    traffic *= 0.6;
  }

  return Math.min(1, traffic);
}

// --- Naturanteil -----------------------------------------------------------

/**
 * Ob ein Wegstück als naturnah zählt.
 *
 * Entscheidend ist der Untergrund, nicht die Wegart. In Bayern sind
 * straßenbegleitende Radwege durchweg als `highway=path` mit
 * `surface=asphalt` erfasst — auf einer Testroute waren das 50 Prozent der
 * Strecke. Sie als Naturweg zu zählen wäre schlicht falsch. Ein Pfad ohne
 * `surface`-Angabe gilt dagegen als naturnah: unbefestigt ist dort der
 * Regelfall, und OSM verzeichnet die Ausnahme.
 */
function isNature(wayType: WayTypeClass, surfaceClass: SurfaceClass): boolean {
  if (surfaceClass === 'natural' || surfaceClass === 'compacted') return true;
  return surfaceClass === 'unknown' && (wayType === 'track' || wayType === 'path');
}

// --- Ausschilderung --------------------------------------------------------

const HIKING_ROUTE_TAGS = [
  'route_hiking_iwn',
  'route_hiking_nwn',
  'route_hiking_rwn',
  'route_hiking_lwn',
];

const BICYCLE_ROUTE_TAGS = [
  'route_bicycle_icn',
  'route_bicycle_ncn',
  'route_bicycle_rcn',
  'route_bicycle_lcn',
];

function isOnSignedRoute(tags: Readonly<Record<string, string>>, sport: Sport): boolean {
  const relevant =
    sport === 'hiking' || sport === 'running' ? HIKING_ROUTE_TAGS : BICYCLE_ROUTE_TAGS;
  return relevant.some((tag) => tags[tag] === 'yes');
}

// --- Schwierigkeit ---------------------------------------------------------

const SAC_SCALE: Record<string, number> = {
  hiking: 1,
  mountain_hiking: 2,
  demanding_mountain_hiking: 3,
  alpine_hiking: 4,
  demanding_alpine_hiking: 5,
  difficult_alpine_hiking: 6,
};

function parseMtbScale(value: string | undefined): number | null {
  if (!value) return null;
  const scale = Number.parseInt(value, 10);
  return Number.isFinite(scale) ? scale : null;
}

// --- Steigung --------------------------------------------------------------

function emptyGradients(): GradientBuckets {
  return { steepDown: 0, down: 0, flat: 0, up: 0, steepUp: 0 };
}

function gradientBucket(gradient: number): keyof GradientBuckets {
  if (gradient <= -0.1) return 'steepDown';
  if (gradient <= -0.04) return 'down';
  if (gradient < 0.04) return 'flat';
  if (gradient < 0.1) return 'up';
  return 'steepUp';
}

// --- Gesamtbewertung -------------------------------------------------------

/**
 * Gewichte für den Reiz-Score je Sportart.
 *
 * Beim Rennrad ist ein hoher Naturweganteil kein Qualitätsmerkmal, sondern
 * meist Schotter unter schmalen Reifen. Dort zählen ausgeschilderte Radrouten
 * und Verkehrsarmut deutlich mehr.
 */
const SCENIC_WEIGHTS: Record<Sport, { nature: number; signed: number; quiet: number }> = {
  hiking: { nature: 0.45, signed: 0.3, quiet: 0.25 },
  running: { nature: 0.45, signed: 0.25, quiet: 0.3 },
  road: { nature: 0.15, signed: 0.35, quiet: 0.5 },
  mtb: { nature: 0.5, signed: 0.25, quiet: 0.25 },
};

export interface MetricsInput {
  points: readonly RoutePoint[];
  segments: readonly RouteSegment[];
  sport: Sport;
  /** Zeit, die BRouter meldet — profilabhängig und nur zur Anzeige. */
  profileDuration: number;
  /** Von BRouter gefilterter Anstieg in Metern (`filtered ascend`). */
  filteredAscent: number;
  /** Netto-Höhendifferenz zwischen Start und Ziel in Metern (`plain-ascend`). */
  netAscent: number;
}

export function computeMetrics(input: MetricsInput): RouteMetrics {
  const { points, segments, sport, profileDuration, filteredAscent, netAscent } = input;

  const surface: SurfaceBreakdown = { paved: 0, compacted: 0, natural: 0, unknown: 0 };
  const wayTypes: WayTypeBreakdown = {
    road: 0,
    cycleway: 0,
    track: 0,
    path: 0,
    steps: 0,
    other: 0,
  };

  let distance = 0;
  let trafficWeighted = 0;
  let natureDistance = 0;
  let signedDistance = 0;
  let maxSacScale: number | null = null;
  let maxMtbScale: number | null = null;

  // Für die Zeitschätzung, die dieselben Einstufungen noch einmal braucht.
  const surfaceClasses: SurfaceClass[] = [];
  const stepFlags: boolean[] = [];

  for (const segment of segments) {
    const length = segment.distance;
    const surfaceClass = classifySurface(segment.tags);
    const wayType = classifyWayType(segment.tags);
    surfaceClasses.push(surfaceClass);
    stepFlags.push(wayType === 'steps');

    if (length <= 0) continue;
    distance += length;

    surface[surfaceClass] += length;
    wayTypes[wayType] += length;

    trafficWeighted += segmentTraffic(segment.tags, sport) * length;

    if (isNature(wayType, surfaceClass)) natureDistance += length;

    if (isOnSignedRoute(segment.tags, sport)) signedDistance += length;

    const sac = SAC_SCALE[segment.tags['sac_scale'] ?? ''];
    if (sac !== undefined && (maxSacScale === null || sac > maxSacScale)) maxSacScale = sac;

    const mtb = parseMtbScale(segment.tags['mtb:scale']);
    if (mtb !== null && (maxMtbScale === null || mtb > maxMtbScale)) maxMtbScale = mtb;
  }

  const gradients = emptyGradients();
  let minElevation = Number.POSITIVE_INFINITY;
  let maxElevation = Number.NEGATIVE_INFINITY;

  if (points.length > 0) {
    const smoothed = smoothElevation(points);
    const distances = cumulativeDistances(points);

    for (const point of points) {
      if (point.ele < minElevation) minElevation = point.ele;
      if (point.ele > maxElevation) maxElevation = point.ele;
    }

    for (let i = 1; i < points.length; i++) {
      const run = distances[i]! - distances[i - 1]!;
      if (run <= 0) continue;
      const rise = smoothed[i]! - smoothed[i - 1]!;
      gradients[gradientBucket(rise / run)] += run;
    }
  } else {
    minElevation = 0;
    maxElevation = 0;
  }

  const trafficExposure = distance > 0 ? clamp01(trafficWeighted / distance) : 0;
  const natureShare = distance > 0 ? clamp01(natureDistance / distance) : 0;
  const signedRouteShare = distance > 0 ? clamp01(signedDistance / distance) : 0;
  const quietScore = 1 - trafficExposure;

  const weights = SCENIC_WEIGHTS[sport];
  const scenicScore = clamp01(
    weights.nature * natureShare + weights.signed * signedRouteShare + weights.quiet * quietScore,
  );

  return {
    distance,
    duration: estimateDuration({ points, segments, sport, surfaceClasses, stepFlags }),
    profileDuration: Math.round(profileDuration),
    ascent: Math.max(0, Math.round(filteredAscent)),
    descent: Math.max(0, Math.round(filteredAscent - netAscent)),
    minElevation,
    maxElevation,
    surface,
    wayTypes,
    gradients,
    trafficExposure,
    natureShare,
    signedRouteShare,
    maxSacScale,
    maxMtbScale,
    scenicScore,
    quietScore,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
