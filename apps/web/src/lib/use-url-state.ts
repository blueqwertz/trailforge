'use client';

import { useEffect, useRef } from 'react';

import { usePlanner } from '@/lib/planner-store';
import { decodeUrlState, encodeUrlState } from '@/lib/url-state';

/**
 * Hält Adresszeile und Zustand im Gleichklang.
 *
 * Beim ersten Rendern wird gelesen, danach nur noch geschrieben. Das Lesen
 * geschieht in einem Effekt und nicht während des Renderns, weil die Seite
 * serverseitig vorgerendert wird und `window` dort nicht existiert.
 *
 * Geschrieben wird mit `replaceState` statt `pushState`: jeder verschobene
 * Wegpunkt als eigener Eintrag im Verlauf würde den Zurück-Knopf unbrauchbar
 * machen.
 */
export function useUrlState(): void {
  const { state, dispatch } = usePlanner();
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const parsed = decodeUrlState(window.location.search);
    if (parsed.sport) dispatch({ type: 'setSport', sport: parsed.sport });
    if (parsed.preference) dispatch({ type: 'setPreference', preference: parsed.preference });
    if (parsed.waypoints) dispatch({ type: 'setWaypoints', waypoints: parsed.waypoints });
  }, [dispatch]);

  useEffect(() => {
    if (!restored.current) return;

    const query = encodeUrlState({
      sport: state.sport,
      preference: state.preference,
      waypoints: state.waypoints,
    });

    const next = `${window.location.pathname}?${query}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', next);
    }
  }, [state.sport, state.preference, state.waypoints]);
}
