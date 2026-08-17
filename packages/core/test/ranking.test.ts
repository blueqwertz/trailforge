import { compareRoutes, rankCandidates } from '../src/ranking';
import type { Preference, Route, RouteMetrics } from '../src/types';

interface Stub {
  id: string;
  distance: number;
  duration: number;
  traffic?: number;
  nature?: number;
  /** Anteil ohne feste Decke, 0 bis 1. */
  unpaved?: number;
  sport?: Route['sport'];
  /** Verschiebt den Verlauf, damit zwei Kandidaten nicht als Dublette gelten. */
  offset?: number;
}

function route({
  id,
  distance,
  duration,
  traffic = 0.3,
  nature = 0.3,
  unpaved = 0,
  sport = 'road',
  offset = 0,
}: Stub): Route {
  const metrics: RouteMetrics = {
    distance,
    duration,
    profileDuration: duration,
    ascent: 0,
    descent: 0,
    minElevation: 500,
    maxElevation: 500,
    surface: {
      paved: distance * (1 - unpaved),
      compacted: distance * unpaved,
      natural: 0,
      unknown: 0,
    },
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
    sport,
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

describe('Eignung für die Sportart', () => {
  it('verwirft Schotterrouten für das Rennrad, auch wenn sie ruhiger sind', () => {
    const paved = route({ id: 'asphalt', distance: 40_000, duration: 5700, traffic: 0.1 });
    const gravel = route({
      id: 'schotter',
      distance: 39_300,
      duration: 6600,
      traffic: 0.06,
      unpaved: 0.37,
      offset: 1,
    });

    const result = rankCandidates([paved, gravel], 'quiet');
    expect(result.best.id).toBe('asphalt');
    // Der untaugliche Kandidat wird nicht als Alternative angeboten.
    expect(result.alternatives).toHaveLength(0);
  });

  it('lässt geringe Schotteranteile zu', () => {
    const mostlyPaved = route({
      id: 'wenig-schotter',
      distance: 40_000,
      duration: 5800,
      traffic: 0.05,
      unpaved: 0.15,
    });
    const busy = route({
      id: 'viel-verkehr',
      distance: 39_000,
      duration: 5600,
      traffic: 0.5,
      offset: 1,
    });

    expect(rank([mostlyPaved, busy], 'quiet')[0]).toBe('wenig-schotter');
  });

  it('greift nur beim Rennrad', () => {
    const gravel = route({
      id: 'schotter',
      distance: 20_000,
      duration: 5000,
      traffic: 0.05,
      unpaved: 0.8,
      sport: 'mtb',
    });
    const road = route({
      id: 'strasse',
      distance: 19_000,
      duration: 4200,
      traffic: 0.6,
      sport: 'mtb',
      offset: 1,
    });

    expect(rank([gravel, road], 'quiet')[0]).toBe('schotter');
  });

  it('behält untaugliche Kandidaten, wenn es keine anderen gibt', () => {
    const gravel = route({ id: 'nur-schotter', distance: 10_000, duration: 2000, unpaved: 0.9 });

    expect(rankCandidates([gravel], 'quiet').best.id).toBe('nur-schotter');
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
