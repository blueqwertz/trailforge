import { profileSupportsParameter } from './brouter-profiles.generated';
import type { Preference, Sport } from './types';

/**
 * Zuordnung von Sportart und Präferenz auf konkrete BRouter-Anfragen.
 *
 * Für jede Kombination werden mehrere Kandidaten erzeugt: verschiedene Profile,
 * verschiedene Parametersätze und BRouters eigene Ausweichrouten. Welcher davon
 * gewinnt, entscheidet nicht diese Tabelle, sondern das Ranking anhand der
 * gemessenen Kennzahlen — siehe `ranking.ts`.
 *
 * Welche Parameter ein Profil überhaupt kennt, steht in
 * `brouter-profiles.generated.ts`, erzeugt aus den echten Profildateien. Das
 * ist nicht überall gleich viel: `trekking` kennt 29 Schalter, `mtb` und
 * `gravel` dagegen keinen einzigen, der die Streckenwahl beeinflusst. Wo ein
 * Profil nicht steuerbar ist, entsteht die Auswahl über verschiedene Profile
 * und BRouters Ausweichrouten statt über Parameter.
 */

export type ProfileParameters = Readonly<Record<string, string | number | boolean>>;

export interface CandidateSpec {
  profile: string;
  parameters: ProfileParameters;
  /** 0 ist BRouters Hauptvariante, 1 bis 3 sind Ausweichrouten. */
  alternativeIndex: number;
  /** Kurzbezeichnung des Kandidaten, erscheint in `Route.id`. */
  label: string;
}

/**
 * Abbiegehinweise anfordern. Der Query-Parameter `timode` allein genügt nicht:
 * Profile mit eigenem `turnInstructionMode` überschreiben ihn wieder, weshalb
 * etwa `hiking-beta` ohne diesen Schalter gar keine Hinweise liefert.
 */
const TURN_INSTRUCTIONS: ProfileParameters = { turnInstructionMode: 3 };

/**
 * Die folgenden Vorgaben sind Vereinigungsmengen über alle Profile: jedes
 * Profil bekommt davon nur, was es kennt (siehe `sanitizeParameters`). Die
 * Profile benennen dieselbe Idee unterschiedlich — `consider_forest` heißt im
 * Gravel-Profil `prefer_forests` — und die älteren rechnen mit 1 und 0 statt
 * mit `true` und `false`. Boolesche Werte werden ohnehin als 1 und 0
 * übertragen, deshalb funktioniert eine gemeinsame Schreibweise für beide.
 */

/** Keine Umwege für Höhenmeter oder ausgeschilderte Routen. */
const DIRECT: ProfileParameters = {
  shortest_way: true,
  consider_elevation: false,
  ignore_cycleroutes: true,
  stick_to_cycleroutes: false,
  prefer_hiking_routes: false,
  prefer_cycle_routes: false,
  cycleroutes_pref: 0,
};

/** Wald, Wasser und Ruhe bevorzugen — BRouter hat diese Klassen vorberechnet. */
const SCENIC: ProfileParameters = {
  consider_forest: true,
  consider_river: true,
  consider_noise: true,
  prefer_forests: true,
  prefer_rivers: true,
  avoid_noise: true,
  prefer_hiking_routes: true,
  hiking_routes_preference: 0.6,
  prefer_cycle_routes: true,
  cycleroutes_pref: 0.6,
};

/**
 * Zusätzlich strikt auf ausgeschilderten Wegen bleiben. Nur als einzelner
 * Kandidat sinnvoll: wo das Wegenetz dünn ist, wird die Strecke dadurch sehr
 * lang oder gar nicht erst gefunden.
 */
const SCENIC_STRICT: ProfileParameters = {
  ...SCENIC,
  stick_to_hiking_routes: true,
  stick_to_cycleroutes: true,
};

/** Verkehr, Lärm und Ortsdurchfahrten meiden. */
const QUIET: ProfileParameters = {
  avoid_unsafe: true,
  consider_traffic: true,
  consider_traffic_estimate: true,
  consider_noise: true,
  consider_town: true,
  avoid_noise: true,
  avoid_towns: true,
};

/**
 * Laufen unterscheidet sich vom Wandern weniger in der Wegwahl als im
 * Untergrund: Treppen unterbrechen den Rhythmus, Matsch und alpines Gelände
 * verbieten sich.
 */
const RUNNING: ProfileParameters = {
  allow_steps: false,
  iswet: true,
  SAC_scale_limit: 2,
};

const MATRIX: Record<Sport, Record<Preference, CandidateSpec[]>> = {
  hiking: {
    shortest: [
      spec('hiking-beta', DIRECT, 0, 'direkt'),
      spec('hiking-beta', DIRECT, 1, 'direkt-alt'),
      spec('hiking-mountain', DIRECT, 0, 'berg-direkt'),
    ],
    fastest: [
      spec('hiking-beta', {}, 0, 'standard'),
      spec('hiking-beta', {}, 1, 'standard-alt'),
      spec('hiking-beta', { consider_elevation: true }, 0, 'flach'),
    ],
    scenic: [
      spec('hiking-beta', SCENIC, 0, 'natur'),
      spec('hiking-beta', SCENIC, 1, 'natur-alt'),
      spec('hiking-mountain', SCENIC, 0, 'berg-natur'),
      spec('hiking-beta', SCENIC_STRICT, 0, 'wanderwege'),
    ],
    quiet: [
      spec('hiking-beta', QUIET, 0, 'ruhig'),
      spec('hiking-beta', QUIET, 1, 'ruhig-alt'),
      spec('hiking-mountain', { ...QUIET, ...SCENIC }, 0, 'berg-ruhig'),
    ],
  },

  // Für das Laufen gibt es kein eigenes BRouter-Profil. `hiking-beta` trifft
  // die Wegauswahl am besten und lässt sich auf laufbaren Untergrund
  // einstellen; `trekking` kommt als Kandidat dazu, weil es durchgehend glatte
  // Wege bevorzugt.
  running: {
    shortest: [
      spec('hiking-beta', { ...DIRECT, ...RUNNING }, 0, 'direkt'),
      spec('hiking-beta', { ...DIRECT, ...RUNNING }, 1, 'direkt-alt'),
      spec('trekking', DIRECT, 0, 'trekking-direkt'),
    ],
    fastest: [
      spec('hiking-beta', RUNNING, 0, 'standard'),
      spec('hiking-beta', RUNNING, 1, 'standard-alt'),
      spec('trekking', {}, 0, 'trekking'),
    ],
    scenic: [
      spec('hiking-beta', { ...SCENIC, ...RUNNING }, 0, 'natur'),
      spec('hiking-beta', { ...SCENIC, ...RUNNING }, 1, 'natur-alt'),
      spec('trekking', SCENIC, 0, 'trekking-natur'),
    ],
    quiet: [
      spec('hiking-beta', { ...QUIET, ...RUNNING }, 0, 'ruhig'),
      spec('hiking-beta', { ...QUIET, ...SCENIC, ...RUNNING }, 0, 'ruhig-natur'),
      spec('trekking', QUIET, 0, 'trekking-ruhig'),
    ],
  },

  road: {
    shortest: [
      spec('shortest', {}, 0, 'kurz'),
      spec('fastbike', DIRECT, 0, 'direkt'),
      spec('fastbike', DIRECT, 1, 'direkt-alt'),
    ],
    fastest: [
      spec('fastbike', {}, 0, 'schnell'),
      spec('fastbike', {}, 1, 'schnell-alt'),
      spec('fastbike-lowtraffic', {}, 0, 'schnell-ruhig'),
    ],
    scenic: [
      spec('fastbike-lowtraffic', SCENIC, 0, 'natur'),
      spec('fastbike-lowtraffic', SCENIC, 1, 'natur-alt'),
      spec('trekking', { ...SCENIC, stick_to_cycleroutes: true }, 0, 'radrouten'),
      spec('fastbike', SCENIC, 0, 'schnell-natur'),
    ],
    quiet: [
      spec('racebike-verylowtraffic', QUIET, 0, 'sehr-ruhig'),
      spec('fastbike-verylowtraffic', QUIET, 0, 'sehr-ruhig-alt'),
      spec('fastbike-lowtraffic', QUIET, 0, 'ruhig'),
      spec('trekking', QUIET, 0, 'trekking-ruhig'),
    ],
  },

  // `mtb` bringt Trail-Bewertung mit, `MTB_SB_light` als einziges MTB-Profil
  // die Wald-, Wasser-, Lärm- und Ortslage-Klassen, `gravel` die
  // Schotter-Variante mit eigenen Namen für dieselben Schalter.
  mtb: {
    shortest: [
      spec('mtb', DIRECT, 0, 'direkt'),
      spec('mtb', DIRECT, 1, 'direkt-alt'),
      spec('MTB_SB_light', DIRECT, 0, 'trail-direkt'),
    ],
    fastest: [
      spec('mtb', {}, 0, 'standard'),
      spec('mtb', {}, 1, 'standard-alt'),
      spec('gravel', {}, 0, 'gravel'),
    ],
    scenic: [
      spec('MTB_SB_light', SCENIC, 0, 'trail'),
      spec('MTB_SB_light', SCENIC, 1, 'trail-alt'),
      spec('gravel', { ...SCENIC, prefer_unpaved_paths: true }, 0, 'gravel-natur'),
      spec('mtb', SCENIC, 0, 'standard-natur'),
    ],
    quiet: [
      spec('MTB_SB_light', QUIET, 0, 'ruhig'),
      spec('MTB_SB_light', { ...QUIET, ...SCENIC }, 0, 'ruhig-natur'),
      spec('mtb', QUIET, 0, 'standard-ruhig'),
      spec('gravel', QUIET, 0, 'gravel-ruhig'),
    ],
  },
};

function spec(
  profile: string,
  parameters: ProfileParameters,
  alternativeIndex: number,
  label: string,
): CandidateSpec {
  return { profile, parameters: { ...TURN_INSTRUCTIONS, ...parameters }, alternativeIndex, label };
}

/**
 * Entfernt Parameter, die das gewählte Profil gar nicht kennt.
 *
 * BRouter ignoriert unbekannte `profile:`-Parameter stillschweigend. Sie
 * trotzdem herauszufiltern hält die URLs kurz, macht das Caching treffsicherer
 * und verhindert vor allem, dass ein vermeintlich gesetzter Schalter
 * wirkungslos bleibt, ohne dass es jemand merkt.
 */
export function sanitizeParameters(
  profile: string,
  parameters: ProfileParameters,
): ProfileParameters {
  const supported: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(parameters)) {
    if (profileSupportsParameter(profile, name)) supported[name] = value;
  }
  return supported;
}

/** Die anzufragenden Kandidaten für eine Kombination aus Sportart und Präferenz. */
export function buildCandidates(sport: Sport, preference: Preference): CandidateSpec[] {
  return MATRIX[sport][preference].map((candidate) => ({
    ...candidate,
    parameters: sanitizeParameters(candidate.profile, candidate.parameters),
  }));
}

/**
 * Eindeutige Kennung einer Anfrage aus Profil, Parametern und Variante.
 * Zwei Kandidaten mit gleicher Kennung würden dieselbe Antwort liefern.
 */
export function candidateSignature(candidate: CandidateSpec): string {
  const parameters = Object.entries(candidate.parameters)
    .map(([name, value]) => `${name}=${String(value)}`)
    .sort()
    .join(',');
  return `${candidate.profile}?${parameters}#${candidate.alternativeIndex}`;
}

/** Alle in der Matrix verwendeten Profile, für Prüfungen und Dokumentation. */
export function usedProfiles(): string[] {
  const profiles = new Set<string>();
  for (const byPreference of Object.values(MATRIX)) {
    for (const candidates of Object.values(byPreference)) {
      for (const candidate of candidates) profiles.add(candidate.profile);
    }
  }
  return [...profiles].sort();
}

export { MATRIX as CANDIDATE_MATRIX };
