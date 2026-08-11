import { BrouterError, fetchBrouterRoute, type FetchOptions } from './brouter.js';
import { buildCandidates } from './profiles.js';
import { rankCandidates } from './ranking.js';
import type { Route, RouteRequest, RouteResult } from './types.js';

/**
 * Verbindet Profilmatrix, Abruf und Ranking zu einer Routenberechnung.
 *
 * Für eine Anfrage werden mehrere Kandidaten abgerufen. Das ist der Preis
 * dafür, dass die Präferenz nachweislich etwas bewirkt: erst der Vergleich
 * mehrerer echter Strecken erlaubt die Aussage, dass die ruhigste Variante
 * tatsächlich weniger Verkehr hat als die schnellste.
 */

export interface PlanOptions extends FetchOptions {
  /**
   * Gleichzeitige Anfragen an BRouter. brouter.de wird ehrenamtlich betrieben,
   * deshalb bewusst niedrig.
   */
  concurrency?: number;
  /** Wird für jeden fehlgeschlagenen Kandidaten aufgerufen. */
  onCandidateError?: (candidateId: string, error: unknown) => void;
}

export async function planRoute(
  request: RouteRequest,
  options: PlanOptions = {},
): Promise<RouteResult> {
  if (request.waypoints.length < 2) {
    throw new BrouterError('Eine Route braucht mindestens zwei Wegpunkte.');
  }

  const candidates = buildCandidates(request.sport, request.preference);
  const routes: Route[] = [];
  const errors: unknown[] = [];

  const concurrency = Math.max(1, options.concurrency ?? 2);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++]!;
      const id = `${request.sport}:${request.preference}:${candidate.label}`;

      try {
        const route = await fetchBrouterRoute(
          {
            waypoints: request.waypoints,
            profile: candidate.profile,
            parameters: candidate.parameters,
            alternativeIndex: candidate.alternativeIndex,
          },
          {
            id,
            sport: request.sport,
            preference: request.preference,
            profile: candidate.profile,
            waypoints: request.waypoints,
          },
          options,
        );
        routes.push(route);
      } catch (error) {
        errors.push(error);
        options.onCandidateError?.(id, error);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));

  if (routes.length === 0) {
    // Alle Kandidaten scheitern in aller Regel aus demselben Grund — etwa ein
    // Wegpunkt mitten im Wasser. Die erste Meldung ist deshalb die aussagekräftigste.
    throw errors[0] instanceof Error
      ? errors[0]
      : new BrouterError('Es konnte keine Route berechnet werden.');
  }

  return rankCandidates(routes, request.preference);
}
