import { readFileSync } from 'node:fs';

import { gpxFileName, routeToGpx } from '../src/gpx.js';
import type { Route } from '../src/types.js';

/** Baut eine kleine, aber vollständige Route für Tests. Überschreibbar. */
function makeRoute(overrides: Partial<Route> = {}): Route {
  const base: Route = {
    id: 'road:quiet:0',
    sport: 'road',
    preference: 'quiet',
    profile: 'trekking',
    points: [
      { lng: 11.575, lat: 48.137, ele: 519.0 },
      { lng: 11.576, lat: 48.1375, ele: 520.4 },
      { lng: 11.5772, lat: 48.1381, ele: 522.1 },
      { lng: 11.5789, lat: 48.139, ele: 518.7 },
      { lng: 11.5803, lat: 48.1399, ele: 515.2 },
    ],
    segments: [{ pointIndex: 0, distance: 12345, tags: { highway: 'primary' } }],
    instructions: [
      { pointIndex: 1, command: 'left', exitNumber: 0, angle: -45, distanceFromStart: 150 },
      { pointIndex: 3, command: 'roundabout', exitNumber: 2, angle: 90, distanceFromStart: 800 },
    ],
    metrics: {
      distance: 12345,
      duration: 2200,
      profileDuration: 2100,
      ascent: 45.5,
      descent: 49.3,
      minElevation: 515.2,
      maxElevation: 522.1,
      surface: { paved: 10000, compacted: 2000, natural: 345, unknown: 0 },
      wayTypes: { road: 11000, cycleway: 1000, track: 345, path: 0, steps: 0, other: 0 },
      gradients: { steepDown: 0, down: 1000, flat: 10345, up: 1000, steepUp: 0 },
      trafficExposure: 0.3,
      natureShare: 0.2,
      signedRouteShare: 0.1,
      maxSacScale: null,
      maxMtbScale: null,
      scenicScore: 0.6,
      quietScore: 0.7,
    },
    waypoints: [
      { lng: 11.575, lat: 48.137 },
      { lng: 11.5803, lat: 48.1399 },
    ],
  };
  return { ...base, ...overrides };
}

describe('routeToGpx', () => {
  it('erzeugt exakt die erwartete GPX-Datei (Golden File)', () => {
    const route = makeRoute();
    const gpx = routeToGpx(route, { now: new Date('2026-07-28T12:00:00.000Z') });
    const expected = readFileSync(new URL('./fixtures/golden-route.gpx', import.meta.url), 'utf8');
    expect(gpx).toBe(expected);
  });

  it('escaped Sonderzeichen in Namen sicher', () => {
    const route = makeRoute();
    const gpx = routeToGpx(route, {
      name: `Tour "Alpen" <Süd> & Nord's Route`,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    // Roh-Sonderzeichen dürfen nicht mehr im Dokument stehen.
    expect(gpx).not.toContain('<Süd>');
    expect(gpx).not.toContain('"Alpen"');
    expect(gpx).not.toContain("Nord's");
    // Korrekt escapte Variante muss vorhanden sein.
    expect(gpx).toContain('Tour &quot;Alpen&quot; &lt;Süd&gt; &amp; Nord&apos;s Route');
    // Das Dokument bleibt wohlgeformt: jedes <name> hat genau einen öffnenden
    // und einen schließenden Tag ohne eingebettete spitze Klammern.
    for (const match of gpx.matchAll(/<name>(.*?)<\/name>/gs)) {
      expect(match[1]).not.toMatch(/[<>]/);
    }
  });

  it('zählt <trkpt> exakt gleich der Anzahl an Streckenpunkten', () => {
    const route = makeRoute();
    const gpx = routeToGpx(route, { now: new Date() });
    const count = (gpx.match(/<trkpt /g) ?? []).length;
    expect(count).toBe(route.points.length);
  });

  it('formatiert Koordinaten mit 6 und Höhen mit 1 Nachkommastelle', () => {
    const route = makeRoute();
    const gpx = routeToGpx(route, { now: new Date() });
    expect(gpx).toContain('lat="48.137000" lon="11.575000"');
    expect(gpx).toContain('<ele>519.0</ele>');
    expect(gpx).toContain('<ele>515.2</ele>');
    expect(gpx).not.toMatch(/[eE][+-]\d/);
    expect(gpx).not.toContain('NaN');
  });

  it('funktioniert mit genau einem Streckenpunkt', () => {
    const route = makeRoute({
      points: [{ lng: 10, lat: 50, ele: 100 }],
      waypoints: [],
      instructions: [],
    });
    const gpx = routeToGpx(route, { now: new Date('2026-01-01T00:00:00.000Z') });
    const count = (gpx.match(/<trkpt /g) ?? []).length;
    expect(count).toBe(1);
    expect(gpx).toContain('<ele>100.0</ele>');
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(gpx.endsWith('\n')).toBe(true);
    expect(gpx.includes('\r')).toBe(false);
  });

  it('exportiert Wegpunkte standardmäßig, aber nicht wenn includeWaypoints=false', () => {
    const route = makeRoute();

    const withWaypoints = routeToGpx(route, { now: new Date() });
    expect((withWaypoints.match(/<wpt /g) ?? []).length).toBe(route.waypoints.length);
    expect(withWaypoints).toContain('Wegpunkt 1');

    const withoutWaypoints = routeToGpx(route, { now: new Date(), includeWaypoints: false });
    expect(withoutWaypoints).not.toContain('<wpt ');
  });

  it('exportiert Abbiegehinweise nur wenn includeTurnInstructions=true', () => {
    const route = makeRoute();

    const withoutTurns = routeToGpx(route, { now: new Date() });
    expect(withoutTurns).not.toContain('Kreisverkehr');

    const withTurns = routeToGpx(route, { now: new Date(), includeTurnInstructions: true });
    expect(withTurns).toContain('Kreisverkehr, Ausfahrt 2');
    expect(withTurns).toContain('Links abbiegen');
    // Standard-Wegpunkte und Abbiegehinweis-Wegpunkte zusammen.
    const wptCount = (withTurns.match(/<wpt /g) ?? []).length;
    expect(wptCount).toBe(route.waypoints.length + route.instructions.length);
  });

  it('lässt <desc> weg, wenn keine Beschreibung angegeben ist', () => {
    const route = makeRoute();
    const gpx = routeToGpx(route, { now: new Date() });
    expect(gpx).not.toContain('<desc>');
  });

  it('fügt <desc> hinzu, wenn eine Beschreibung angegeben ist', () => {
    const route = makeRoute();
    const gpx = routeToGpx(route, { now: new Date(), description: 'Testbeschreibung' });
    expect(gpx).toContain('<desc>Testbeschreibung</desc>');
  });

  it('verwendet den Standardnamen aus Sportart und Länge, wenn kein Name angegeben ist', () => {
    const route = makeRoute();
    const gpx = routeToGpx(route, { now: new Date() });
    expect(gpx).toContain('<name>Rennrad 12 km</name>');
  });

  it('setzt <type> auf die Sportart der Route', () => {
    const route = makeRoute({ sport: 'mtb' });
    const gpx = routeToGpx(route, { now: new Date() });
    expect(gpx).toContain('<type>mtb</type>');
  });
});

describe('gpxFileName', () => {
  it('leitet den Dateinamen aus Sportart und gerundeter Länge ab', () => {
    const route = makeRoute({
      sport: 'road',
      metrics: { ...makeRoute().metrics, distance: 42000 },
    });
    expect(gpxFileName(route)).toBe('trailforge-rennrad-42km.gpx');
  });

  it('übersetzt alle Sportarten ins Deutsche', () => {
    const cases: Array<[Route['sport'], string]> = [
      ['hiking', 'wandern'],
      ['running', 'laufen'],
      ['road', 'rennrad'],
      ['mtb', 'mtb'],
    ];
    for (const [sport, de] of cases) {
      const route = makeRoute({ sport, metrics: { ...makeRoute().metrics, distance: 10000 } });
      expect(gpxFileName(route)).toBe(`trailforge-${de}-10km.gpx`);
    }
  });

  it('erzeugt einen dateisystemsicheren Namen: klein, ohne Leerzeichen, bindestrichgetrennt', () => {
    const route = makeRoute();
    const fileName = gpxFileName(route);
    expect(fileName).toMatch(/^[a-z0-9-]+\.gpx$/);
    expect(fileName).not.toContain(' ');
    expect(fileName).toBe(fileName.toLowerCase());
  });

  it('rundet die Länge auf ganze Kilometer', () => {
    const route = makeRoute({ metrics: { ...makeRoute().metrics, distance: 42499 } });
    expect(gpxFileName(route)).toBe('trailforge-rennrad-42km.gpx');

    const routeRoundedUp = makeRoute({ metrics: { ...makeRoute().metrics, distance: 42501 } });
    expect(gpxFileName(routeRoundedUp)).toBe('trailforge-rennrad-43km.gpx');
  });
});
