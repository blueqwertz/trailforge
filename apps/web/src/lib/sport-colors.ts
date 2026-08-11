import type { Sport } from '@trailforge/core';

/**
 * Akzentfarbe je Sportart — die einzige Quelle dafür.
 *
 * Bewusst als Hexwert und in TypeScript, nicht als CSS-Variable in modernem
 * Farbraum: MapLibre bekommt dieselbe Farbe wie die Oberfläche, kann aber
 * `oklch()` nicht auswerten. Eine Ebene mit einer solchen Farbe wird beim
 * Hinzufügen stillschweigend verworfen — die Route bleibt dann unsichtbar,
 * ohne dass etwas fehlschlägt.
 *
 * Die Oberfläche greift über `--accent` am Sport-Container darauf zu; die
 * gleichen Werte stehen dafür als Tokens in `globals.css`.
 */
export const SPORT_ACCENT: Record<Sport, string> = {
  hiking: '#4d7c3f',
  running: '#b45309',
  road: '#b91c1c',
  mtb: '#0f766e',
};
