import { PREFERENCES, SPORTS, type LngLat, type Preference, type Sport } from '@trailforge/core';

/**
 * Zustand in der Adresszeile.
 *
 * Eine geplante Tour ist damit ohne Konto und ohne Datenbank teilbar, und der
 * Zurück-Knopf des Browsers tut das Erwartbare. Die Wegpunkte stehen mit fünf
 * Nachkommastellen darin — das entspricht etwa einem Meter und hält die
 * Adresse kurz genug zum Verschicken.
 */

const COORDINATE_PRECISION = 5;

export interface UrlState {
  sport: Sport;
  preference: Preference;
  waypoints: LngLat[];
}

export function encodeUrlState(state: UrlState): string {
  const params = new URLSearchParams();
  params.set('s', state.sport);
  params.set('p', state.preference);

  if (state.waypoints.length > 0) {
    params.set(
      'w',
      state.waypoints
        .map(
          (point) =>
            `${point.lat.toFixed(COORDINATE_PRECISION)},${point.lng.toFixed(COORDINATE_PRECISION)}`,
        )
        .join(';'),
    );
  }

  // Semikolon und Komma sind in Query-Werten zulässig und bleiben lesbar.
  return params.toString().replace(/%3B/g, ';').replace(/%2C/g, ',');
}

export function decodeUrlState(search: string): Partial<UrlState> {
  const params = new URLSearchParams(search);
  const result: Partial<UrlState> = {};

  const sport = params.get('s');
  if (sport && (SPORTS as readonly string[]).includes(sport)) {
    result.sport = sport as Sport;
  }

  const preference = params.get('p');
  if (preference && (PREFERENCES as readonly string[]).includes(preference)) {
    result.preference = preference as Preference;
  }

  const waypoints = params.get('w');
  if (waypoints) {
    const parsed = waypoints
      .split(';')
      .map((pair) => {
        const [lat, lng] = pair.split(',').map(Number);
        return lat !== undefined &&
          lng !== undefined &&
          Number.isFinite(lat) &&
          Number.isFinite(lng)
          ? { lat, lng }
          : null;
      })
      .filter((point): point is LngLat => point !== null);

    // Ein einzelner Punkt ergibt keine Route, ist aber ein gültiger Zwischenstand.
    if (parsed.length > 0) result.waypoints = parsed;
  }

  return result;
}
