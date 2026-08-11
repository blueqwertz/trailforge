import { computeMetrics } from '../src/metrics';
import type { RoutePoint, RouteSegment, Sport } from '../src/types';
import { routeFromFixture } from './brouter.test';

/** Gerade Strecke nach Osten mit vorgegebenem Höhenverlauf. */
function line(pointCount: number, spacingMeters: number, elevations?: number[]): RoutePoint[] {
  const metersPerDegree = 111_320 * Math.cos((48 * Math.PI) / 180);
  return Array.from({ length: pointCount }, (_, i) => ({
    lng: 11 + (i * spacingMeters) / metersPerDegree,
    lat: 48,
    ele: elevations?.[i] ?? 500,
  }));
}

function segment(distance: number, tags: Record<string, string>, pointIndex: number): RouteSegment {
  return { pointIndex, distance, tags };
}

function metricsOf(
  segments: RouteSegment[],
  sport: Sport = 'road',
  points: RoutePoint[] = line(segments.length + 1, 100),
) {
  return computeMetrics({
    points,
    segments,
    sport,
    profileDuration: 0,
    filteredAscent: 0,
    netAscent: 0,
  });
}

describe('Oberflächen-Einstufung', () => {
  it('trennt befestigt, wassergebunden und naturbelassen', () => {
    const metrics = metricsOf([
      segment(100, { highway: 'residential', surface: 'asphalt' }, 1),
      segment(100, { highway: 'track', surface: 'gravel' }, 2),
      segment(100, { highway: 'path', surface: 'ground' }, 3),
      segment(100, { highway: 'path' }, 4),
    ]);

    expect(metrics.surface).toEqual({
      paved: 100,
      compacted: 100,
      natural: 100,
      unknown: 100,
    });
  });

  it('greift auf tracktype zurück, wenn surface fehlt', () => {
    const metrics = metricsOf([
      segment(100, { highway: 'track', tracktype: 'grade1' }, 1),
      segment(100, { highway: 'track', tracktype: 'grade3' }, 2),
      segment(100, { highway: 'track', tracktype: 'grade5' }, 3),
    ]);

    expect(metrics.surface.paved).toBe(100);
    expect(metrics.surface.compacted).toBe(100);
    expect(metrics.surface.natural).toBe(100);
    expect(metrics.surface.unknown).toBe(0);
  });
});

describe('Verkehrsbelastung', () => {
  it('steigt mit der Straßenklasse', () => {
    const path = metricsOf([segment(1000, { highway: 'path' }, 1)]);
    const residential = metricsOf([segment(1000, { highway: 'residential' }, 1)]);
    const primary = metricsOf([segment(1000, { highway: 'primary' }, 1)]);

    expect(path.trafficExposure).toBe(0);
    expect(residential.trafficExposure).toBeLessThan(primary.trafficExposure);
    expect(primary.trafficExposure).toBeGreaterThan(0.8);
  });

  it('zieht BRouters Verkehrsschätzung heran, wo sie vorliegt', () => {
    const plain = metricsOf([segment(1000, { highway: 'residential' }, 1)]);
    const estimated = metricsOf([
      segment(1000, { highway: 'residential', estimated_traffic_class: '5' }, 1),
    ]);

    expect(estimated.trafficExposure).toBeGreaterThan(plain.trafficExposure);
  });

  it('rechnet Radinfrastruktur entlastend an', () => {
    const bare = metricsOf([segment(1000, { highway: 'secondary' }, 1)]);
    const withTrack = metricsOf([
      segment(1000, { highway: 'secondary', 'cycleway:right': 'track' }, 1),
    ]);
    const bicycleRoad = metricsOf([
      segment(1000, { highway: 'residential', bicycle_road: 'yes' }, 1),
    ]);
    const plainResidential = metricsOf([segment(1000, { highway: 'residential' }, 1)]);

    expect(withTrack.trafficExposure).toBeLessThan(bare.trafficExposure);
    expect(bicycleRoad.trafficExposure).toBeLessThan(plainResidential.trafficExposure);
  });

  it('ist das Gegenstück zum Ruhe-Wert', () => {
    const metrics = metricsOf([segment(1000, { highway: 'tertiary' }, 1)]);
    expect(metrics.quietScore).toBeCloseTo(1 - metrics.trafficExposure, 10);
  });
});

describe('Ausschilderung', () => {
  it('zählt je nach Sportart Wander- oder Radrouten', () => {
    const segments = [
      segment(500, { highway: 'path', route_hiking_lwn: 'yes' }, 1),
      segment(500, { highway: 'path', route_bicycle_rcn: 'yes' }, 2),
    ];

    expect(metricsOf(segments, 'hiking').signedRouteShare).toBeCloseTo(0.5, 5);
    expect(metricsOf(segments, 'road').signedRouteShare).toBeCloseTo(0.5, 5);
    expect(metricsOf([segments[0]!], 'road').signedRouteShare).toBe(0);
    expect(metricsOf([segments[1]!], 'hiking').signedRouteShare).toBe(0);
  });
});

describe('Schwierigkeit', () => {
  it('merkt sich die höchste SAC- und MTB-Stufe', () => {
    const metrics = metricsOf(
      [
        segment(100, { highway: 'path', sac_scale: 'hiking', 'mtb:scale': '1' }, 1),
        segment(100, { highway: 'path', sac_scale: 'alpine_hiking', 'mtb:scale': '3' }, 2),
        segment(100, { highway: 'path' }, 3),
      ],
      'hiking',
    );

    expect(metrics.maxSacScale).toBe(4);
    expect(metrics.maxMtbScale).toBe(3);
  });

  it('lässt die Stufen offen, wenn nichts getaggt ist', () => {
    const metrics = metricsOf([segment(100, { highway: 'path' }, 1)]);
    expect(metrics.maxSacScale).toBeNull();
    expect(metrics.maxMtbScale).toBeNull();
  });
});

describe('Steigungsklassen', () => {
  it('verteilt die Strecke auf die Klassen', () => {
    // 100 m eben, dann 100 m mit 20 Prozent Steigung.
    const points = line(3, 100, [500, 500, 520]);
    const metrics = metricsOf(
      [segment(100, { highway: 'path' }, 1), segment(100, { highway: 'path' }, 2)],
      'hiking',
      points,
    );

    const total = Object.values(metrics.gradients).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(200, 0);
    expect(metrics.gradients.steepUp).toBeGreaterThan(0);
  });
});

describe('Zeitschätzung', () => {
  const flat = [segment(10_000, { highway: 'residential', surface: 'asphalt' }, 1)];

  it('rechnet für jede Sportart mit eigenem Tempo', () => {
    const road = metricsOf(flat, 'road').duration;
    const mtb = metricsOf(flat, 'mtb').duration;
    const running = metricsOf(flat, 'running').duration;
    const hiking = metricsOf(flat, 'hiking').duration;

    expect(road).toBeLessThan(mtb);
    expect(mtb).toBeLessThan(running);
    expect(running).toBeLessThan(hiking);

    // 10 km auf ebenem Asphalt: rund 23 Minuten mit dem Rennrad.
    expect(road).toBeGreaterThan(20 * 60);
    expect(road).toBeLessThan(26 * 60);
  });

  it('bestraft schlechten Untergrund beim Rennrad stärker als zu Fuß', () => {
    const gravel = [segment(10_000, { highway: 'track', surface: 'gravel' }, 1)];

    const roadLoss = metricsOf(gravel, 'road').duration / metricsOf(flat, 'road').duration;
    const hikingLoss = metricsOf(gravel, 'hiking').duration / metricsOf(flat, 'hiking').duration;

    expect(roadLoss).toBeGreaterThan(hikingLoss);
  });

  it('kostet Steigung Zeit', () => {
    const points = line(2, 1000, [500, 600]);
    const uphill = metricsOf([segment(1000, { highway: 'path' }, 1)], 'hiking', points);
    const level = metricsOf([segment(1000, { highway: 'path' }, 1)], 'hiking', line(2, 1000));

    // 10 Prozent Steigung kosten nach Tobler rund 40 Prozent Zeit.
    expect(uphill.duration / level.duration).toBeGreaterThan(1.35);
    expect(uphill.duration / level.duration).toBeLessThan(1.6);
  });

  it('ist unabhängig vom Profil, anders als BRouters eigene Angabe', () => {
    // Dieselben zwei Punkte in München: BRouter meldet für `shortest`
    // 251 Minuten und für `trekking` 64 Minuten, weil beide Profile mit
    // verschiedenen kinematischen Modellen rechnen. Unsere Schätzung macht die
    // Kandidaten wieder vergleichbar.
    const shortest = routeFromFixture('brouter-shortest-munich', 'road').metrics;
    const trekking = routeFromFixture('brouter-trekking-munich', 'road').metrics;

    expect(shortest.profileDuration / trekking.profileDuration).toBeGreaterThan(3);
    expect(shortest.duration / trekking.duration).toBeGreaterThan(0.7);
    expect(shortest.duration / trekking.duration).toBeLessThan(1.3);
  });
});

describe('Kennzahlen echter Routen', () => {
  it('erkennt die Asphaltroute des Rennrad-Profils', () => {
    const metrics = routeFromFixture('brouter-road-quiet-munich', 'road').metrics;

    expect(metrics.surface.paved / metrics.distance).toBeGreaterThan(0.95);
    expect(metrics.natureShare).toBeLessThan(0.6);
  });

  it('erkennt die Naturroute der Bergwanderung', () => {
    const metrics = routeFromFixture('brouter-hiking-alps', 'hiking').metrics;

    expect(metrics.natureShare).toBeGreaterThan(0.9);
    expect(metrics.trafficExposure).toBeLessThan(0.1);
    expect(metrics.maxSacScale).toBe(1);
    expect(metrics.ascent).toBe(344);
    expect(metrics.gradients.steepUp).toBeGreaterThan(500);
  });

  it('hält alle Anteile im Bereich von null bis eins', () => {
    for (const name of [
      'brouter-trekking-munich',
      'brouter-hiking-alps',
      'brouter-road-quiet-munich',
      'brouter-shortest-munich',
    ] as const) {
      const metrics = routeFromFixture(name, 'road').metrics;
      for (const value of [
        metrics.trafficExposure,
        metrics.natureShare,
        metrics.signedRouteShare,
        metrics.scenicScore,
        metrics.quietScore,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
