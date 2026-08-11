import { planRoute } from '../src/planner.js';
import type { Preference } from '../src/types.js';

/**
 * Contract-Tests gegen die echten Dienste.
 *
 * Laufen absichtlich nicht in der CI (`pnpm test:live`), damit die
 * ehrenamtlich betriebenen Server nicht bei jedem Push Last bekommen. Sie
 * beantworten zwei Fragen, die kein Test mit Fixtures beantworten kann:
 * Hat sich die API von BRouter verändert? Und bewirkt die gewählte Präferenz
 * tatsächlich etwas?
 */

// München Hauptbahnhof nach Ebersberg: lang genug für echte Alternativen,
// kurz genug, um den Dienst nicht zu strapazieren.
const WAYPOINTS = [
  { lng: 11.5583, lat: 48.1401 },
  { lng: 11.9705, lat: 48.0776 },
];

const results = new Map<Preference, Awaited<ReturnType<typeof planRoute>>>();

beforeAll(async () => {
  for (const preference of ['shortest', 'fastest', 'scenic', 'quiet'] as const) {
    results.set(preference, await planRoute({ waypoints: WAYPOINTS, sport: 'road', preference }));
    // Zwischen den Präferenzen kurz durchatmen.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}, 300_000);

describe('BRouter, echter Dienst', () => {
  it('liefert für jede Präferenz eine Route mit Kennzahlen', () => {
    for (const [preference, result] of results) {
      expect(result.best.points.length, preference).toBeGreaterThan(50);
      expect(result.best.metrics.distance, preference).toBeGreaterThan(30_000);
      expect(result.best.segments.length, preference).toBeGreaterThan(20);

      // Ohne Tags je Wegstück gäbe es keine Kennzahlen — das ist die
      // Eigenschaft der Antwort, auf der alles Weitere aufbaut.
      const tagged = result.best.segments.filter((segment) => Object.keys(segment.tags).length > 0);
      expect(tagged.length / result.best.segments.length, preference).toBeGreaterThan(0.9);
    }
  });

  it('findet zu jeder Präferenz mindestens eine echte Alternative', () => {
    for (const [preference, result] of results) {
      expect(result.alternatives.length, preference).toBeGreaterThan(0);
    }
  });

  it('macht die kürzeste Route auch tatsächlich zur kürzesten', () => {
    const shortest = results.get('shortest')!.best.metrics.distance;

    for (const [preference, result] of results) {
      if (preference === 'shortest') continue;
      expect(shortest, preference).toBeLessThanOrEqual(result.best.metrics.distance * 1.02);
    }
  });

  it('macht die ruhigste Route ruhiger als die schnellste', () => {
    const quiet = results.get('quiet')!.best.metrics;
    const fastest = results.get('fastest')!.best.metrics;

    expect(quiet.trafficExposure).toBeLessThan(fastest.trafficExposure);
  });

  it('macht die schönste Route naturnäher oder besser ausgeschildert als die schnellste', () => {
    const scenic = results.get('scenic')!.best.metrics;
    const fastest = results.get('fastest')!.best.metrics;

    expect(scenic.scenicScore).toBeGreaterThan(fastest.scenicScore);
  });

  it('hält den Umweg der weichen Präferenzen im Rahmen', () => {
    const shortest = results.get('shortest')!.best.metrics.distance;

    for (const preference of ['scenic', 'quiet'] as const) {
      const distance = results.get(preference)!.best.metrics.distance;
      expect(distance / shortest, preference).toBeLessThan(1.8);
    }
  });
});
