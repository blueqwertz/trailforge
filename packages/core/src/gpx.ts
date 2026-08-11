/**
 * GPX-Export für berechnete Routen.
 *
 * Reine Zeichenkettenverarbeitung ohne Laufzeitabhängigkeiten, damit dieses
 * Modul unverändert im Browser, in Node und in React Native funktioniert.
 */

import type { Route, RoutePoint, Sport, TurnCommand } from './types.js';

export interface GpxOptions {
  /** Name des Tracks, Standard: aus Sportart und Länge abgeleitet */
  name?: string;
  /** Zusätzliche Beschreibung im metadata-Block */
  description?: string;
  /** Wegpunkte des Nutzers als <wpt> exportieren, Standard: true */
  includeWaypoints?: boolean;
  /** Abbiegehinweise als <wpt> exportieren, Standard: false */
  includeTurnInstructions?: boolean;
  /** Zeitstempel im metadata-Block, Standard: new Date() */
  now?: Date;
}

/** Deutsche Bezeichnungen der Sportarten, u. a. für Namen und Dateinamen. */
const SPORT_NAMES_DE: Record<Sport, string> = {
  hiking: 'wandern',
  running: 'laufen',
  road: 'rennrad',
  mtb: 'mtb',
};

/** Deutsche Kurzbezeichnungen der Abbiegehinweise für Wegpunktnamen. */
const TURN_LABELS_DE: Record<TurnCommand, string> = {
  continue: 'Geradeaus',
  left: 'Links abbiegen',
  'slight-left': 'Leicht links',
  'sharp-left': 'Scharf links',
  right: 'Rechts abbiegen',
  'slight-right': 'Leicht rechts',
  'sharp-right': 'Scharf rechts',
  'keep-left': 'Links halten',
  'keep-right': 'Rechts halten',
  'u-turn': 'Wenden',
  roundabout: 'Kreisverkehr',
  beeline: 'Luftlinie',
};

const GPX_HEADER =
  '<gpx version="1.1" creator="TrailForge" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">';

// --- Hilfsfunktionen ---------------------------------------------------

/** Escaped Text- und Attributinhalte streng nach XML-Regeln. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Formatiert eine Zahl fix, nie in Exponentialschreibweise, nie NaN. */
function formatFixed(value: number, decimals: number): string {
  if (!Number.isFinite(value)) {
    return (0).toFixed(decimals);
  }
  return value.toFixed(decimals);
}

function formatCoord(value: number): string {
  return formatFixed(value, 6);
}

function formatEle(value: number): string {
  return formatFixed(value, 1);
}

/** ISO 8601 UTC ohne Millisekunden, z. B. "2026-07-28T12:00:00Z". */
function formatIsoUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Transliteriert deutsche Umlaute und ß in ASCII-Äquivalente. */
function transliterateGerman(input: string): string {
  return input
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss');
}

/**
 * Wandelt beliebigen Text in einen dateisystemsicheren Slug um: klein
 * geschrieben, Umlaute transliteriert, Trennung durch Bindestriche.
 */
function slugifyDe(input: string): string {
  return transliterateGerman(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function roundedKm(distanceMeters: number): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return 0;
  }
  return Math.round(distanceMeters / 1000);
}

function defaultName(route: Route): string {
  const sportDe = SPORT_NAMES_DE[route.sport];
  return `${capitalize(sportDe)} ${roundedKm(route.metrics.distance)} km`;
}

// --- Bausteine -----------------------------------------------------------

function buildTrkpt(point: RoutePoint): string {
  return [
    `      <trkpt lat="${formatCoord(point.lat)}" lon="${formatCoord(point.lng)}">`,
    `        <ele>${formatEle(point.ele)}</ele>`,
    `      </trkpt>`,
  ].join('\n');
}

function buildWaypointWpts(route: Route): string[] {
  return route.waypoints.map((waypoint, index) => {
    return [
      `  <wpt lat="${formatCoord(waypoint.lat)}" lon="${formatCoord(waypoint.lng)}">`,
      `    <name>${escapeXml(`Wegpunkt ${index + 1}`)}</name>`,
      `  </wpt>`,
    ].join('\n');
  });
}

function buildTurnInstructionWpts(route: Route): string[] {
  const lines: string[] = [];
  for (const instruction of route.instructions) {
    const point = route.points[instruction.pointIndex];
    if (point === undefined) {
      // Ungültiger Index, z. B. bei inkonsistenten Testdaten: überspringen.
      continue;
    }
    const label = TURN_LABELS_DE[instruction.command];
    const name =
      instruction.command === 'roundabout' && instruction.exitNumber > 0
        ? `${label}, Ausfahrt ${instruction.exitNumber}`
        : label;
    lines.push(
      [
        `  <wpt lat="${formatCoord(point.lat)}" lon="${formatCoord(point.lng)}">`,
        `    <ele>${formatEle(point.ele)}</ele>`,
        `    <name>${escapeXml(name)}</name>`,
        `    <cmt>${escapeXml(`${Math.round(instruction.distanceFromStart)} m ab Start`)}</cmt>`,
        `  </wpt>`,
      ].join('\n'),
    );
  }
  return lines;
}

// --- Öffentliche API -------------------------------------------------------

export function routeToGpx(route: Route, options?: GpxOptions): string {
  const now = options?.now ?? new Date();
  const name = options?.name ?? defaultName(route);
  const description = options?.description;
  const includeWaypoints = options?.includeWaypoints ?? true;
  const includeTurnInstructions = options?.includeTurnInstructions ?? false;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(GPX_HEADER);

  lines.push('  <metadata>');
  lines.push(`    <name>${escapeXml(name)}</name>`);
  if (description !== undefined) {
    lines.push(`    <desc>${escapeXml(description)}</desc>`);
  }
  lines.push(`    <time>${formatIsoUtc(now)}</time>`);
  lines.push('    <copyright author="OpenStreetMap contributors">');
  lines.push('      <license>https://opendatacommons.org/licenses/odbl/</license>');
  lines.push('    </copyright>');
  lines.push('  </metadata>');

  if (includeWaypoints) {
    lines.push(...buildWaypointWpts(route));
  }
  if (includeTurnInstructions) {
    lines.push(...buildTurnInstructionWpts(route));
  }

  lines.push('  <trk>');
  lines.push(`    <name>${escapeXml(name)}</name>`);
  lines.push(`    <type>${escapeXml(route.sport)}</type>`);
  lines.push('    <trkseg>');
  for (const point of route.points) {
    lines.push(buildTrkpt(point));
  }
  lines.push('    </trkseg>');
  lines.push('  </trk>');

  lines.push('</gpx>');

  return lines.join('\n') + '\n';
}

/** Dateiname wie "trailforge-rennrad-42km.gpx", ohne Pfad. */
export function gpxFileName(route: Route): string {
  const sportSlug = slugifyDe(SPORT_NAMES_DE[route.sport]);
  const km = roundedKm(route.metrics.distance);
  return `trailforge-${sportSlug}-${km}km.gpx`;
}
