import { cumulativeDistances } from './geo.js';
import { computeMetrics } from './metrics.js';
import type {
  LngLat,
  Preference,
  Route,
  RoutePoint,
  RouteSegment,
  Sport,
  TurnCommand,
  TurnInstruction,
} from './types.js';

export const BROUTER_BASE_URL = 'https://brouter.de/brouter';

/**
 * brouter.de wird ehrenamtlich betrieben. Ein sprechender User-Agent gehört
 * zum guten Ton und erlaubt dem Betreiber, bei Auffälligkeiten Kontakt
 * aufzunehmen, statt pauschal zu sperren.
 */
export const USER_AGENT = 'TrailForge/0.1 (+https://github.com/blueqwertz/trailforge)';

export class BrouterError extends Error {
  /** Rohantwort des Dienstes, gekürzt — hilft bei der Fehlersuche. */
  readonly detail: string | undefined;

  // Bewusst ohne Parameter-Property: dieses Paket wird als TypeScript-Quelle
  // eingebunden und muss auch mit reinen Typ-Entfernern übersetzbar bleiben.
  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'BrouterError';
    this.detail = detail;
  }
}

export interface BrouterQuery {
  waypoints: readonly LngLat[];
  profile: string;
  /**
   * Laufzeit-Parameter des Profils, die BRouter als `profile:<name>` entgegen
   * nimmt. Boolesche Werte werden als 1 und 0 übertragen.
   */
  parameters?: Readonly<Record<string, string | number | boolean>>;
  /** 0 ist die Hauptvariante, 1 bis 3 sind Ausweichrouten. */
  alternativeIndex?: number;
  baseUrl?: string;
}

/** Baut die Anfrage-URL. Ausgelagert, damit sie ohne Netz testbar bleibt. */
export function buildBrouterUrl(query: BrouterQuery): string {
  if (query.waypoints.length < 2) {
    throw new BrouterError('Eine Route braucht mindestens zwei Wegpunkte.');
  }

  const lonlats = query.waypoints
    .map((point) => `${round6(point.lng)},${round6(point.lat)}`)
    .join('|');

  const url = new URL(query.baseUrl ?? BROUTER_BASE_URL);
  url.searchParams.set('lonlats', lonlats);
  url.searchParams.set('profile', query.profile);
  url.searchParams.set('format', 'geojson');
  url.searchParams.set('alternativeidx', String(query.alternativeIndex ?? 0));
  // Abbiegehinweise anfordern; Profile ohne Unterstützung liefern sie schlicht nicht.
  url.searchParams.set('timode', '3');

  for (const [name, value] of Object.entries(query.parameters ?? {})) {
    const encoded = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
    url.searchParams.set(`profile:${name}`, encoded);
  }

  // Die Wegpunktliste wird unkodiert übertragen: so sieht die URL aus, wie sie
  // in BRouters eigener Dokumentation steht, und bleibt im Log lesbar.
  return url.toString().replace(/%7C/g, '|').replace(/%2C/g, ',');
}

interface BrouterFeatureProperties {
  'track-length'?: string;
  'total-time'?: string;
  'filtered ascend'?: string;
  'plain-ascend'?: string;
  messages?: string[][];
  voicehints?: number[][];
  times?: number[];
}

interface BrouterResponse {
  type?: string;
  features?: {
    properties?: BrouterFeatureProperties;
    geometry?: { coordinates?: number[][] };
  }[];
}

export interface ParseContext {
  id: string;
  sport: Sport;
  preference: Preference;
  profile: string;
  waypoints: readonly LngLat[];
}

/**
 * Übersetzt eine BRouter-GeoJSON-Antwort in unser Routenmodell.
 *
 * Die Antwort enthält neben der Geometrie ein `messages`-Array: eine Zeile je
 * Wegstück mit Länge und den OSM-Tags des Weges. Diese Zeilen lassen sich
 * anhand ihrer Koordinaten den Geometriepunkten zuordnen — geprüft an echten
 * Antworten, die Zuordnung ist vollständig und monoton.
 */
export function parseBrouterResponse(payload: unknown, context: ParseContext): Route {
  const response = payload as BrouterResponse;
  const feature = response.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties;

  if (!feature || !coordinates || coordinates.length === 0 || !properties) {
    throw new BrouterError(
      'BRouter hat keine Route geliefert.',
      typeof payload === 'string' ? payload.slice(0, 500) : undefined,
    );
  }

  const points: RoutePoint[] = coordinates.map((coordinate) => ({
    lng: coordinate[0] ?? 0,
    lat: coordinate[1] ?? 0,
    ele: coordinate[2] ?? 0,
  }));

  const segments = parseSegments(properties.messages, points);
  const distances = cumulativeDistances(points);
  const instructions = parseInstructions(properties.voicehints, distances);

  const metrics = computeMetrics({
    points,
    segments,
    sport: context.sport,
    profileDuration: toNumber(properties['total-time']),
    filteredAscent: toNumber(properties['filtered ascend']),
    netAscent: toNumber(properties['plain-ascend']),
  });

  // BRouters `track-length` ist die maßgebliche Länge; unsere aufsummierten
  // Wegstücke stimmen damit überein, sind aber nur so genau wie die Tag-Zeilen.
  const declaredLength = toNumber(properties['track-length']);
  if (declaredLength > 0) {
    metrics.distance = declaredLength;
  }

  return {
    id: context.id,
    sport: context.sport,
    preference: context.preference,
    profile: context.profile,
    points,
    segments,
    instructions,
    metrics,
    waypoints: [...context.waypoints],
  };
}

const MESSAGE_COLUMN = {
  longitude: 0,
  latitude: 1,
  distance: 3,
  wayTags: 9,
} as const;

function parseSegments(
  messages: string[][] | undefined,
  points: readonly RoutePoint[],
): RouteSegment[] {
  if (!messages || messages.length < 2) return [];

  // Zeile 0 ist die Spaltenüberschrift.
  const rows = messages.slice(1);
  const index = buildCoordinateIndex(points);
  const segments: RouteSegment[] = [];
  let cursor = 0;

  for (const row of rows) {
    const lng = toNumber(row[MESSAGE_COLUMN.longitude]) / 1e6;
    const lat = toNumber(row[MESSAGE_COLUMN.latitude]) / 1e6;
    const pointIndex = lookupCoordinate(index, lng, lat, cursor);
    if (pointIndex !== null) cursor = pointIndex;

    segments.push({
      pointIndex: pointIndex ?? cursor,
      distance: toNumber(row[MESSAGE_COLUMN.distance]),
      tags: parseTags(row[MESSAGE_COLUMN.wayTags] ?? ''),
    });
  }

  return segments;
}

type CoordinateIndex = Map<string, number[]>;

function buildCoordinateIndex(points: readonly RoutePoint[]): CoordinateIndex {
  const index: CoordinateIndex = new Map();
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    const key = coordinateKey(point.lng, point.lat);
    const existing = index.get(key);
    if (existing) existing.push(i);
    else index.set(key, [i]);
  }
  return index;
}

function lookupCoordinate(
  index: CoordinateIndex,
  lng: number,
  lat: number,
  cursor: number,
): number | null {
  const candidates = index.get(coordinateKey(lng, lat));
  if (!candidates) return null;
  for (const candidate of candidates) {
    if (candidate >= cursor) return candidate;
  }
  return candidates[candidates.length - 1] ?? null;
}

const coordinateKey = (lng: number, lat: number): string => `${round6(lng)},${round6(lat)}`;

/** Zerlegt `highway=path surface=asphalt` in ein Objekt. */
export function parseTags(wayTags: string): Record<string, string> {
  const tags: Record<string, string> = {};
  if (!wayTags) return tags;

  for (const entry of wayTags.split(' ')) {
    if (!entry) continue;
    const separator = entry.indexOf('=');
    if (separator <= 0) continue;
    tags[entry.slice(0, separator)] = entry.slice(separator + 1);
  }

  return tags;
}

/**
 * BRouters Kommandonummern. Die Zuordnung ist an echten Antworten überprüft:
 * die mitgelieferten Winkel passen jeweils zur Richtung (2 mittelt bei −85°,
 * 5 bei +85°, 1 liegt innerhalb von ±19°).
 */
const VOICE_HINT_COMMANDS: Record<number, TurnCommand> = {
  1: 'continue',
  2: 'left',
  3: 'slight-left',
  4: 'sharp-left',
  5: 'right',
  6: 'slight-right',
  7: 'sharp-right',
  8: 'keep-left',
  9: 'keep-right',
  10: 'u-turn',
  11: 'u-turn',
  12: 'beeline',
  13: 'roundabout',
  14: 'roundabout',
};

function parseInstructions(
  voicehints: number[][] | undefined,
  distances: readonly number[],
): TurnInstruction[] {
  if (!voicehints) return [];

  const instructions: TurnInstruction[] = [];
  for (const hint of voicehints) {
    const pointIndex = hint[0];
    const command = VOICE_HINT_COMMANDS[hint[1] ?? 0];
    if (pointIndex === undefined || !command) continue;

    instructions.push({
      pointIndex,
      command,
      exitNumber: hint[2] ?? 0,
      angle: hint[4] ?? 0,
      distanceFromStart: distances[pointIndex] ?? 0,
    });
  }

  return instructions;
}

// --- Abruf -----------------------------------------------------------------

export interface FetchOptions {
  /** Eigene fetch-Implementierung, etwa für Tests oder Server-Caching. */
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Zusätzliche Versuche bei vorübergehenden Fehlern. */
  retries?: number;
  /** Wartezeit vor dem ersten erneuten Versuch, verdoppelt sich danach. */
  retryDelayMs?: number;
}

/**
 * Statuscodes, bei denen sich ein zweiter Versuch lohnt.
 *
 * brouter.de antwortet auf Anfragebündel gelegentlich mit 400, obwohl exakt
 * dieselbe Anfrage einzeln funktioniert — beobachtet bei vier gleichzeitigen
 * Kandidaten. Es ist also eine Lastbremse, kein Eingabefehler.
 */
const RETRYABLE_STATUS = new Set([400, 408, 425, 429, 500, 502, 503, 504]);

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchBrouterRoute(
  query: BrouterQuery,
  context: ParseContext,
  options: FetchOptions = {},
): Promise<Route> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const url = buildBrouterUrl(query);
  const attempts = Math.max(0, options.retries ?? 2) + 1;
  let wait = options.retryDelayMs ?? 400;

  let response: Response | undefined;
  let body = '';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    response = await doFetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    body = await response.text();

    if (response.ok || !RETRYABLE_STATUS.has(response.status) || attempt === attempts) break;

    await delay(wait);
    wait *= 2;
  }

  if (!response || !response.ok) {
    throw new BrouterError(
      `BRouter antwortete mit Status ${response?.status ?? 0}.`,
      body.slice(0, 500),
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    // Fehler meldet BRouter als Klartext mit Status 200, etwa
    // „position not mapped in existing datafile".
    throw new BrouterError(translateBrouterError(body), body.slice(0, 500));
  }

  return parseBrouterResponse(payload, context);
}

/** Übersetzt die bekannten Klartextfehler in verständliche Meldungen. */
export function translateBrouterError(body: string): string {
  const text = body.toLowerCase();
  if (text.includes('position not mapped')) {
    return 'Mindestens ein Punkt liegt zu weit von einem Weg entfernt.';
  }
  if (text.includes('operation killed') || text.includes('timeout')) {
    return 'Die Strecke ist für den Routing-Dienst zu lang.';
  }
  if (text.includes('no track found') || text.includes('target island detected')) {
    return 'Zwischen diesen Punkten gibt es keine durchgehende Verbindung.';
  }
  return 'Der Routing-Dienst konnte keine Route berechnen.';
}

function toNumber(value: string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;
