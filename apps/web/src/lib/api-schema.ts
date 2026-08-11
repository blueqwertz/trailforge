import { PREFERENCES, SPORTS, type Route } from '@trailforge/core';
import { z } from 'zod';

/**
 * Vertrag zwischen Oberfläche und Routing-Endpunkt.
 *
 * Auch die spätere iOS-App spricht gegen diesen Endpunkt, deshalb steht das
 * Schema in einer eigenen Datei und nicht im Route Handler.
 */

const waypointSchema = z.object({
  lng: z.number().gte(-180).lte(180),
  lat: z.number().gte(-90).lte(90),
});

export const routeRequestSchema = z.object({
  // Zwölf Wegpunkte sind großzügig; jeder weitere verlängert die Rechenzeit
  // beim Routing-Dienst spürbar.
  waypoints: z.array(waypointSchema).min(2).max(12),
  sport: z.enum(SPORTS),
  preference: z.enum(PREFERENCES),
});

export type RouteRequestBody = z.infer<typeof routeRequestSchema>;

/**
 * Route ohne die Wegstücke.
 *
 * Die Tags je Wegstück sind der Rohstoff für die Kennzahlen und werden auf dem
 * Server verarbeitet. Sie mitzuschicken würde die Antwort bei einer 40 km
 * langen Strecke etwa verdoppeln, ohne dass die Oberfläche etwas damit anfängt.
 */
export type RouteDto = Omit<Route, 'segments'>;

export interface RouteResponseBody {
  best: RouteDto;
  alternatives: RouteDto[];
}

export interface ErrorResponseBody {
  /** Schlüssel aus dem Namensraum `errors.*` der Übersetzungen. */
  errorKey: string;
}

export function toRouteDto(route: Route): RouteDto {
  const { segments: _segments, ...rest } = route;
  return rest;
}
