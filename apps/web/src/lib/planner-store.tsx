'use client';

import type { LngLat, Preference, Route, Sport } from '@trailforge/core';
import { createContext, useContext, useMemo, useReducer } from 'react';

/**
 * Zustand des Routenplaners.
 *
 * Bewusst ein einzelner Reducer statt verstreuter useState-Aufrufe: fast jede
 * Änderung — andere Sportart, anderer Wegpunkt, andere Präferenz — macht die
 * berechnete Route ungültig, und dieser Zusammenhang gehört an eine Stelle.
 */

export interface PlannerState {
  sport: Sport;
  preference: Preference;
  waypoints: LngLat[];
  route: Route | null;
  alternatives: Route[];
  status: 'idle' | 'loading' | 'error';
  /** Schlüssel aus `errors.*`, nicht der fertige Text. */
  errorKey: string | null;
  /** Position entlang der Route in Metern, für den Abgleich von Karte und Profil. */
  hoverDistance: number | null;
  /** Zähler, der jede Neuberechnung auslöst. */
  requestId: number;
}

export type PlannerAction =
  | { type: 'setSport'; sport: Sport }
  | { type: 'setPreference'; preference: Preference }
  | { type: 'addWaypoint'; point: LngLat }
  | { type: 'insertWaypoint'; index: number; point: LngLat }
  | { type: 'moveWaypoint'; index: number; point: LngLat }
  | { type: 'removeWaypoint'; index: number }
  | { type: 'setWaypoints'; waypoints: LngLat[] }
  | { type: 'reverseWaypoints' }
  | { type: 'clearWaypoints' }
  | { type: 'requestStarted' }
  | { type: 'requestSucceeded'; route: Route; alternatives: Route[] }
  | { type: 'requestFailed'; errorKey: string }
  | { type: 'selectAlternative'; id: string }
  | { type: 'setHoverDistance'; distance: number | null };

export const initialPlannerState: PlannerState = {
  sport: 'hiking',
  preference: 'scenic',
  waypoints: [],
  route: null,
  alternatives: [],
  status: 'idle',
  errorKey: null,
  hoverDistance: null,
  requestId: 0,
};

/** Jede Änderung an der Streckenführung verwirft das bisherige Ergebnis. */
function invalidate(state: PlannerState, waypoints: LngLat[]): PlannerState {
  return {
    ...state,
    waypoints,
    route: null,
    alternatives: [],
    errorKey: null,
    status: waypoints.length >= 2 ? 'loading' : 'idle',
    hoverDistance: null,
    requestId: state.requestId + 1,
  };
}

export function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case 'setSport':
      if (action.sport === state.sport) return state;
      return { ...invalidate(state, state.waypoints), sport: action.sport };

    case 'setPreference':
      if (action.preference === state.preference) return state;
      return { ...invalidate(state, state.waypoints), preference: action.preference };

    case 'addWaypoint':
      return invalidate(state, [...state.waypoints, action.point]);

    case 'insertWaypoint': {
      const waypoints = [...state.waypoints];
      waypoints.splice(action.index, 0, action.point);
      return invalidate(state, waypoints);
    }

    case 'moveWaypoint': {
      const waypoints = state.waypoints.map((waypoint, index) =>
        index === action.index ? action.point : waypoint,
      );
      return invalidate(state, waypoints);
    }

    case 'removeWaypoint':
      return invalidate(
        state,
        state.waypoints.filter((_, index) => index !== action.index),
      );

    case 'setWaypoints':
      return invalidate(state, action.waypoints);

    case 'reverseWaypoints':
      return invalidate(state, [...state.waypoints].reverse());

    case 'clearWaypoints':
      return invalidate(state, []);

    case 'requestStarted':
      return { ...state, status: 'loading', errorKey: null };

    case 'requestSucceeded':
      return {
        ...state,
        status: 'idle',
        errorKey: null,
        route: action.route,
        alternatives: action.alternatives,
      };

    case 'requestFailed':
      return {
        ...state,
        status: 'error',
        errorKey: action.errorKey,
        route: null,
        alternatives: [],
      };

    case 'selectAlternative': {
      const chosen = state.alternatives.find((alternative) => alternative.id === action.id);
      if (!chosen || !state.route) return state;

      // Die bisherige Empfehlung rutscht in die Alternativen, damit der
      // Wechsel umkehrbar bleibt.
      return {
        ...state,
        route: chosen,
        alternatives: [
          state.route,
          ...state.alternatives.filter((alternative) => alternative.id !== action.id),
        ],
        hoverDistance: null,
      };
    }

    case 'setHoverDistance':
      return { ...state, hoverDistance: action.distance };
  }
}

interface PlannerContextValue {
  state: PlannerState;
  dispatch: React.Dispatch<PlannerAction>;
}

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function PlannerProvider({
  children,
  initialState = initialPlannerState,
}: {
  children: React.ReactNode;
  initialState?: PlannerState;
}) {
  const [state, dispatch] = useReducer(plannerReducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlanner(): PlannerContextValue {
  const context = useContext(PlannerContext);
  if (!context) {
    throw new Error('usePlanner muss innerhalb von PlannerProvider verwendet werden.');
  }
  return context;
}
