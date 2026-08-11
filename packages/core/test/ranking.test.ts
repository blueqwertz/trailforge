import { compareRoutes, rankCandidates } from '../src/ranking';
import type { Preference, Route, RouteMetrics } from '../src/types';

interface Stub {
  id: string;
  distance: number;
  duration: number;
  traffic?: number;
  nature?: number;
  /** Verschiebt den Verlauf, damit zwei Kandidaten nicht als Dublette gelten. */
  offset?: number;
}

function route({ id, distance, duration, traffic = 0.3, nature = 0.3, offset = 0 }: Stub): Route {
  const metrics: RouteMetrics = {
    distance,
    duration,
    profileDuration: duration,
    ascent: 0,
    descent: 0,
    minElevation: 500,
    maxElevation: 500,
    surface: { paved: distance, compacted: 0, natural: 0, unknown: 0 },
    wayTypes: { road: distance, cycleway: 0, track: 0, path: 0, steps: 0, other: 0 },
    gradients: { steepDown: 0, down: 0, flat: distance, up: 0, steepUp: 0 },
    trafficExposure: traffic,
    natureShare: nature,
    signedRouteShare: 0,
    maxSacScale: null,
    maxMtbScale: null,
    scenicScore: nature,
    quietScore: 1 - traffic,
  };

  return {
    id,
    sport: 'road',
    preference: 'fastest',
    profile: 'test',
    points: [
      { lng: 11 + offset, lat: 48, ele: 500 },
      { lng: 11.1 + offset, lat: 48.1, ele: 500 },
      { lng: 11.2 + offset, lat: 48.2, ele: 500 },
    ],
    segments: [],
    instructions: [],
    metrics,
    waypoints: [],
  };
}

function rank(routes: Route[], preference: Preference) {
  const result = rankCandidates(routes, preference);
  return [result.best.id, ...result.alternatives.map((alternative) => alternative.id)];
}

describe('rankCandidates', () => {
  const short = route({ id: 'kurz', distance: 10_000, duration: 2000, traffic: 0.7, offset: 0 });
  const fast = route({ id: 'schnell', distance: 11_000, duration: 1500, traffic: 0.6, offset: 1 });
  const quiet = route({ id: 'ruhig', distance: 12_500, duration: 2200, traffic: 0.1, offset: 2 });
  const pretty = route({
    id: 'schoen',
    distance: 13_000,
    duration: 2400,
    traffic: 0.2,
    nature: 0.9,
    offset: 3,
  });

  const candidates = [short, fast, quiet, pretty];

  it('wählt bei „kürzeste" die kürzeste Strecke', () => {
    expect(rank(candidates, 'shortest')[0]).toBe('kurz');
  });

  it('wählt bei „schnellste" die geringste Zeit', () => {
    expect(rank(candidates, 'fastest')[0]).toBe('schnell');
  });

  it('wählt bei „ruhigste" die verkehrsärmste Strecke', () => {
    expect(rank(candidates, 'quiet')[0]).toBe('ruhig');
  });

  it('wählt bei „schönste" die Strecke mit dem höchsten Naturanteil', () => {
    expect(rank(candidates, 'scenic')[0]).toBe('schoen');
  });

  it('gibt die übrigen Kandidaten als Alternativen zurück', () => {
    const result = rankCandidates(candidates, 'fastest');
    expect(result.alternatives).toHaveLength(3);
    expect(result.alternatives.map((alternative) => alternative.id)).not.toContain(result.best.id);
  });
});

describe('Umweg-Abzug', () => {
  it('bevorzugt Ruhe, solange der Umweg vertretbar bleibt', () => {
    const direct = route({ id: 'direkt', distance: 10_000, duration: 1800, traffic: 0.6 });
    const calm = route({ id: 'ruhig', distance: 11_000, duration: 2000, traffic: 0.1, offset: 1 });

    // 10 Prozent Umweg für halb so viel Verkehr: lohnt sich.
    expect(rank([direct, calm], 'quiet')[0]).toBe('ruhig');
  });

  it('lehnt einen unverhältnismäßigen Umweg ab', () => {
    const direct = route({ id: 'direkt', distance: 10_000, duration: 1800, traffic: 0.35 });
    const detour = route({
      id: 'umweg',
      distance: 18_000,
      duration: 3200,
      traffic: 0.1,
      offset: 1,
    });

    // 80 Prozent länger für 25 Prozentpunkte weniger Verkehr: lohnt sich nicht.
    expect(rank([direct, detour], 'quiet')[0]).toBe('direkt');
  });
});

describe('Dubletten', () => {
  it('fasst praktisch gleiche Strecken zusammen', () => {
    const a = route({ id: 'a', distance: 10_000, duration: 1800 });
    const b = route({ id: 'b', distance: 10_010, duration: 1805 });

    const result = rankCandidates([a, b], 'fastest');
    expect(result.alternatives).toHaveLength(0);
  });

  it('behält Strecken mit anderem Verlauf trotz gleicher Länge', () => {
    const a = route({ id: 'a', distance: 10_000, duration: 1800 });
    const b = route({ id: 'b', distance: 10_000, duration: 1800, offset: 0.5 });

    const result = rankCandidates([a, b], 'fastest');
    expect(result.alternatives).toHaveLength(1);
  });

  it('verwirft Kandidaten ohne brauchbare Geometrie', () => {
    const valid = route({ id: 'gut', distance: 10_000, duration: 1800 });
    const broken = { ...route({ id: 'kaputt', distance: 1, duration: 1 }), points: [] };

    expect(rankCandidates([valid, broken], 'fastest').best.id).toBe('gut');
  });

  it('meldet, wenn gar nichts übrig bleibt', () => {
    expect(() => rankCandidates([], 'fastest')).toThrow();
  });
});

describe('compareRoutes', () => {
  it('beschreibt den Unterschied zum Sieger', () => {
    const best = route({ id: 'sieger', distance: 10_000, duration: 1800, traffic: 0.6 });
    const other = route({ id: 'andere', distance: 13_100, duration: 2100, traffic: 0.2 });

    const comparison = compareRoutes(other, best);
    expect(comparison.distanceDelta).toBe(3100);
    expect(comparison.durationDelta).toBe(300);
    expect(comparison.trafficDelta).toBeCloseTo(-0.4, 5);
  });
});
