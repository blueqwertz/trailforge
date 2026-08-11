'use client';

import type { Route } from '@trailforge/core';
import { useEffect } from 'react';

import type { ErrorResponseBody, RouteResponseBody } from '@/lib/api-schema';
import { usePlanner } from '@/lib/planner-store';

/**
 * Holt die Route, sobald sich an der Eingabe etwas ändert.
 *
 * Ausgelöst wird über den Zähler im Zustand, nicht über die Wegpunkte selbst:
 * auch ein Wechsel der Sportart oder der Präferenz muss neu rechnen lassen,
 * obwohl die Wegpunkte gleich bleiben.
 */

/** Kurze Verzögerung, damit schnelles Umschalten nicht jede Zwischenstufe abfragt. */
const DEBOUNCE_MS = 250;

export function useRouteRequest(): void {
  const { state, dispatch } = usePlanner();
  const { requestId, waypoints, sport, preference } = state;

  useEffect(() => {
    if (waypoints.length < 2) return;

    const controller = new AbortController();

    const timer = setTimeout(() => {
      dispatch({ type: 'requestStarted' });

      void (async () => {
        try {
          const response = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ waypoints, sport, preference }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as ErrorResponseBody | null;
            dispatch({ type: 'requestFailed', errorKey: body?.errorKey ?? 'errors.service' });
            return;
          }

          const body = (await response.json()) as RouteResponseBody;
          dispatch({
            type: 'requestSucceeded',
            // Die Wegstücke bleiben auf dem Server; das Routenmodell verlangt
            // sie, die Oberfläche braucht sie nicht.
            route: { ...body.best, segments: [] } as Route,
            alternatives: body.alternatives.map(
              (alternative) => ({ ...alternative, segments: [] }) as Route,
            ),
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          dispatch({ type: 'requestFailed', errorKey: 'errors.service' });
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Der Zähler steht stellvertretend für jede Änderung an der Eingabe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);
}
