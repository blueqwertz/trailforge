import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BrouterError } from '../src/brouter';
import { planRoute } from '../src/planner';
import { buildCandidates } from '../src/profiles';

const FIXTURES = [
  'brouter-trekking-munich',
  'brouter-road-quiet-munich',
  'brouter-shortest-munich',
];

function fixtureBody(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8');
}

const waypoints = [
  { lng: 11.582, lat: 48.1351 },
  { lng: 11.75, lat: 48.26 },
];

/** Liefert der Reihe nach die Fixtures und protokolliert die aufgerufenen URLs. */
function stubFetch(bodies: string[] = FIXTURES.map(fixtureBody)) {
  const urls: string[] = [];
  let call = 0;

  const fetchStub = ((url: string) => {
    urls.push(String(url));
    const body = bodies[call % bodies.length]!;
    call++;
    return Promise.resolve(new Response(body, { status: 200 }));
  }) as unknown as typeof globalThis.fetch;

  return { fetchStub, urls };
}

describe('planRoute', () => {
  it('fragt genau die Kandidaten der Matrix ab und liefert den besten zurück', async () => {
    const { fetchStub, urls } = stubFetch();

    const result = await planRoute(
      { waypoints, sport: 'road', preference: 'quiet' },
      { fetch: fetchStub },
    );

    expect(urls).toHaveLength(buildCandidates('road', 'quiet').length);
    for (const url of urls) {
      expect(url).toContain('lonlats=11.582,48.1351|11.75,48.26');
      expect(url).toContain('format=geojson');
    }

    expect(result.best.sport).toBe('road');
    expect(result.best.preference).toBe('quiet');
    expect(result.best.metrics.distance).toBeGreaterThan(0);
    expect(result.best.waypoints).toEqual(waypoints);
  });

  it('nutzt die Profile und Parameter der Matrix', async () => {
    const { fetchStub, urls } = stubFetch();

    await planRoute({ waypoints, sport: 'hiking', preference: 'scenic' }, { fetch: fetchStub });

    const hikingBeta = urls.filter((url) => url.includes('profile=hiking-beta'));
    const hikingMountain = urls.filter((url) => url.includes('profile=hiking-mountain'));
    expect(hikingBeta.length).toBeGreaterThan(0);
    expect(hikingMountain.length).toBeGreaterThan(0);

    // Beide Profile meinen dasselbe, benennen es aber anders: hiking-beta kennt
    // nur `prefer_hiking_routes`, die Wald- und Wasserklassen gibt es dort gar
    // nicht — sie dürfen deshalb auch nicht mitgeschickt werden.
    for (const url of hikingBeta) {
      expect(url).toContain('profile%3Aprefer_hiking_routes=1');
      expect(url).not.toContain('consider_forest');
    }
    for (const url of hikingMountain) {
      expect(url).toContain('profile%3Aconsider_forest=1');
    }
  });

  it('spricht auf Wunsch einen eigenen Routing-Dienst an', async () => {
    const { fetchStub, urls } = stubFetch();

    await planRoute(
      { waypoints, sport: 'road', preference: 'fastest' },
      { fetch: fetchStub, baseUrl: 'http://localhost:17777/brouter' },
    );

    for (const url of urls) {
      expect(url.startsWith('http://localhost:17777/brouter?')).toBe(true);
    }
  });

  it('kommt mit einzelnen fehlgeschlagenen Kandidaten zurecht', async () => {
    let call = 0;
    const fetchStub = (() => {
      call++;
      if (call === 1) {
        return Promise.resolve(
          new Response('position not mapped in existing datafile', { status: 200 }),
        );
      }
      return Promise.resolve(new Response(fixtureBody('brouter-trekking-munich'), { status: 200 }));
    }) as unknown as typeof globalThis.fetch;

    const failures: string[] = [];
    const result = await planRoute(
      { waypoints, sport: 'road', preference: 'fastest' },
      { fetch: fetchStub, concurrency: 1, onCandidateError: (id) => failures.push(id) },
    );

    expect(failures).toHaveLength(1);
    expect(result.best).toBeDefined();
  });

  it('meldet den ursprünglichen Fehler, wenn alle Kandidaten scheitern', async () => {
    const fetchStub = (() =>
      Promise.resolve(
        new Response('position not mapped in existing datafile', { status: 200 }),
      )) as unknown as typeof globalThis.fetch;

    await expect(
      planRoute({ waypoints, sport: 'road', preference: 'fastest' }, { fetch: fetchStub }),
    ).rejects.toThrow(/zu weit von einem Weg/);
  });

  it('verlangt mindestens zwei Wegpunkte', async () => {
    await expect(
      planRoute({ waypoints: [waypoints[0]!], sport: 'road', preference: 'fastest' }),
    ).rejects.toThrow(BrouterError);
  });

  it('hält die Zahl gleichzeitiger Anfragen ein', async () => {
    let active = 0;
    let peak = 0;

    const fetchStub = (() => {
      active++;
      peak = Math.max(peak, active);
      return new Promise<Response>((resolve) => {
        setTimeout(() => {
          active--;
          resolve(new Response(fixtureBody('brouter-trekking-munich'), { status: 200 }));
        }, 5);
      });
    }) as unknown as typeof globalThis.fetch;

    await planRoute(
      { waypoints, sport: 'mtb', preference: 'scenic' },
      { fetch: fetchStub, concurrency: 2 },
    );

    expect(peak).toBeLessThanOrEqual(2);
  });
});
