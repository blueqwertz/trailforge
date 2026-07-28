/**
 * Zentrale Typen von TrailForge.
 *
 * Bewusst frei von Browser- und Node-APIs, damit dieses Paket unverändert in
 * einer späteren React-Native-App verwendet werden kann.
 */

/** Unterstützte Sportarten. */
export const SPORTS = ['hiking', 'running', 'road', 'mtb'] as const;
export type Sport = (typeof SPORTS)[number];

/**
 * Was dem Nutzer an der Route wichtig ist. Bestimmt sowohl das BRouter-Profil
 * samt Parametern als auch, nach welcher Kennzahl die Kandidaten sortiert werden.
 */
export const PREFERENCES = ['shortest', 'fastest', 'scenic', 'quiet'] as const;
export type Preference = (typeof PREFERENCES)[number];

export interface LngLat {
  lng: number;
  lat: number;
}

/** Punkt der berechneten Linie inklusive Höhe über NN in Metern. */
export interface RoutePoint extends LngLat {
  ele: number;
}

export interface RouteRequest {
  /** Mindestens zwei Punkte: Start, optionale Zwischenziele, Ziel. */
  waypoints: LngLat[];
  sport: Sport;
  preference: Preference;
}

// --- Kennzahlen ------------------------------------------------------------

/** Zusammengefasste Oberflächenkategorien, Anteile in Metern. */
export interface SurfaceBreakdown {
  /** Asphalt, Beton, Pflaster. */
  paved: number;
  /** Schotter, Kies, wassergebundene Decke. */
  compacted: number;
  /** Erde, Gras, Sand, Fels. */
  natural: number;
  /** Ohne `surface`-Tag in OSM. */
  unknown: number;
}

/** Weg-Kategorien, Anteile in Metern. */
export interface WayTypeBreakdown {
  /** Straßen mit Kfz-Verkehr. */
  road: number;
  /** Baulich getrennte Radwege. */
  cycleway: number;
  /** Wirtschafts- und Feldwege. */
  track: number;
  /** Pfade, Fuß- und Wanderwege. */
  path: number;
  /** Treppen. */
  steps: number;
  other: number;
}

export interface GradientBuckets {
  /** Gefälle steiler als -10 %. */
  steepDown: number;
  /** -10 % bis -4 %. */
  down: number;
  /** -4 % bis +4 %. */
  flat: number;
  /** +4 % bis +10 %. */
  up: number;
  /** Steigung steiler als +10 %. */
  steepUp: number;
}

export interface RouteMetrics {
  /** Länge in Metern. */
  distance: number;
  /** Fahr- bzw. Gehzeit in Sekunden, aus dem kinematischen Modell des Profils. */
  duration: number;
  ascent: number;
  descent: number;
  minElevation: number;
  maxElevation: number;

  surface: SurfaceBreakdown;
  wayTypes: WayTypeBreakdown;
  gradients: GradientBuckets;

  /**
   * Geschätzte Verkehrsbelastung, 0 (verkehrsfrei) bis 1 (Hauptverkehrsstraße).
   * Kombiniert die OSM-Straßenklasse, BRouters `estimated_traffic_class` und
   * vorhandene Radinfrastruktur, gewichtet nach Streckenanteil.
   */
  trafficExposure: number;
  /** Streckenanteil auf Pfaden, Wegen und unbefestigtem Untergrund, 0 bis 1. */
  natureShare: number;
  /** Streckenanteil auf ausgeschilderten Wander- oder Radrouten, 0 bis 1. */
  signedRouteShare: number;

  /** Höchste SAC-Wanderskala auf der Strecke, falls getaggt (T1–T6). */
  maxSacScale: number | null;
  /** Höchste MTB-Schwierigkeit auf der Strecke, falls getaggt (S0–S5). */
  maxMtbScale: number | null;

  /** Abgeleiteter Reiz der Strecke, 0 bis 1. Siehe `scoreScenic`. */
  scenicScore: number;
  /** Ruhe der Strecke, 0 bis 1. Gegenstück zu `trafficExposure`. */
  quietScore: number;
}

// --- Abbiegehinweise -------------------------------------------------------

export type TurnCommand =
  | 'continue'
  | 'left'
  | 'slight-left'
  | 'sharp-left'
  | 'right'
  | 'slight-right'
  | 'sharp-right'
  | 'keep-left'
  | 'keep-right'
  | 'u-turn'
  | 'roundabout'
  | 'beeline';

export interface TurnInstruction {
  /** Index des zugehörigen Punktes in `Route.points`. */
  pointIndex: number;
  command: TurnCommand;
  /** Ausfahrtnummer bei Kreisverkehren. */
  exitNumber: number;
  /** Richtungsänderung in Grad, negativ bedeutet links. */
  angle: number;
  /** Entfernung vom Start bis zu diesem Hinweis, in Metern. */
  distanceFromStart: number;
}

// --- Route -----------------------------------------------------------------

/** Ein Wegstück konstanter Eigenschaften, wie BRouter es liefert. */
export interface RouteSegment {
  /** Index des Startpunktes in `Route.points`. */
  pointIndex: number;
  /** Länge des Wegstücks in Metern. */
  distance: number;
  /** OSM-Tags des Weges, bereits in Schlüssel/Wert zerlegt. */
  tags: Readonly<Record<string, string>>;
}

export interface Route {
  /** Stabile Kennung des Kandidaten, z. B. `road:quiet:0`. */
  id: string;
  sport: Sport;
  /** Präferenz, für die dieser Kandidat erzeugt wurde. */
  preference: Preference;
  /** Verwendetes BRouter-Profil, für Nachvollziehbarkeit und Fehlersuche. */
  profile: string;
  points: RoutePoint[];
  segments: RouteSegment[];
  instructions: TurnInstruction[];
  metrics: RouteMetrics;
  /** Die vom Nutzer gesetzten Wegpunkte, für Neuberechnung und GPX-Export. */
  waypoints: LngLat[];
}

export interface RouteResult {
  /** Bester Kandidat für die gewählte Präferenz. */
  best: Route;
  /**
   * Übrige Kandidaten, absteigend nach Eignung sortiert. Werden in der
   * Oberfläche als Alternativen angeboten.
   */
  alternatives: Route[];
}
