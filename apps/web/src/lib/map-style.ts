import type { Sport } from '@trailforge/core';

/**
 * Kartenquellen. Alle frei nutzbar und ohne Schlüssel.
 *
 * Grundkarte von OpenFreeMap, Geländeschummerung aus den Terrain-Kacheln im
 * AWS-Open-Data-Bestand, Wege-Überlagerung von Waymarked Trails. Letztere
 * zeigt genau die ausgeschilderten Routen, deren Anteil die Kennzahlen messen —
 * die Karte belegt damit, was das Panel behauptet.
 */

export const BASE_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** Waymarked Trails führt je Sportart ein eigenes Netz. */
const WAYMARKED_LAYER: Record<Sport, string> = {
  hiking: 'hiking',
  running: 'hiking',
  road: 'cycling',
  mtb: 'mtb',
};

export const TERRAIN_SOURCE_ID = 'trailforge-terrain';
export const HILLSHADE_LAYER_ID = 'trailforge-hillshade';
export const WAYMARKED_SOURCE_ID = 'trailforge-waymarked';
export const WAYMARKED_LAYER_ID = 'trailforge-waymarked-layer';
export const ROUTE_SOURCE_ID = 'trailforge-route';

export function terrainSource() {
  return {
    type: 'raster-dem' as const,
    tiles: [TERRAIN_TILES],
    tileSize: 256,
    // Die Kacheln kodieren die Höhe als RGB nach dem Terrarium-Schema.
    encoding: 'terrarium' as const,
    maxzoom: 14,
    attribution:
      '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a>, <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  };
}

export function waymarkedSource(sport: Sport) {
  return {
    type: 'raster' as const,
    tiles: [`https://tile.waymarkedtrails.org/${WAYMARKED_LAYER[sport]}/{z}/{x}/{y}.png`],
    tileSize: 256,
    maxzoom: 18,
    attribution: '<a href="https://waymarkedtrails.org">Waymarked Trails</a>',
  };
}

export function waymarkedTilesFor(sport: Sport): string[] {
  return [`https://tile.waymarkedtrails.org/${WAYMARKED_LAYER[sport]}/{z}/{x}/{y}.png`];
}

/** Kartenausschnitt beim ersten Aufruf: Alpenrand, weil dort alle vier Sportarten Sinn ergeben. */
export const INITIAL_VIEW = {
  center: [11.4, 47.8] as [number, number],
  zoom: 8.5,
};
