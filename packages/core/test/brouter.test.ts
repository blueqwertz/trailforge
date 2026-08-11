import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildBrouterUrl,
  parseBrouterResponse,
  parseTags,
  translateBrouterError,
  BrouterError,
} from '../src/brouter';
import type { Preference, Sport } from '../src/types';

export function loadFixture(name: string): unknown {
  const path = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function routeFromFixture(
  name: string,
  sport: Sport = 'road',
  preference: Preference = 'fastest',
) {
  return parseBrouterResponse(loadFixture(name), {
    id: name,
    sport,
    preference,
    profile: 'trekking',
    waypoints: [
      { lng: 11.582, lat: 48.1351 },
      { lng: 11.75, lat: 48.26 },
    ],
  });
}

describe('buildBrouterUrl', () => {
  it('setzt Wegpunkte, Profil und Format', () => {
    const url = buildBrouterUrl({
      waypoints: [
        { lng: 11.582, lat: 48.1351 },
        { lng: 11.75, lat: 48.26 },
      ],
      profile: 'trekking',
    });

    expect(url).toContain('lonlats=11.582,48.1351|11.75,48.26');
    expect(url).toContain('profile=trekking');
    expect(url).toContain('format=geojson');
    expect(url).toContain('alternativeidx=0');
  });

  it('überträgt Profilparameter mit dem Präfix profile:', () => {
    const url = buildBrouterUrl({
      waypoints: [
        { lng: 11.582, lat: 48.1351 },
        { lng: 11.75, lat: 48.26 },
      ],
      profile: 'trekking',
      parameters: { consider_forest: true, avoid_unsafe: false, downhillcost: 60 },
      alternativeIndex: 2,
    });

    expect(url).toContain('profile%3Aconsider_forest=1');
    expect(url).toContain('profile%3Aavoid_unsafe=0');
    expect(url).toContain('profile%3Adownhillcost=60');
    expect(url).toContain('alternativeidx=2');
  });

  it('verlangt mindestens zwei Wegpunkte', () => {
    expect(() =>
      buildBrouterUrl({ waypoints: [{ lng: 11, lat: 48 }], profile: 'trekking' }),
    ).toThrow(BrouterError);
  });
});

describe('parseTags', () => {
  it('zerlegt die Tag-Zeile', () => {
    expect(parseTags('highway=path surface=asphalt foot=designated')).toEqual({
      highway: 'path',
      surface: 'asphalt',
      foot: 'designated',
    });
  });

  it('verträgt Werte mit Gleichheitszeichen und leere Eingaben', () => {
    expect(parseTags('name=A=B')).toEqual({ name: 'A=B' });
    expect(parseTags('')).toEqual({});
    expect(parseTags('kaputt')).toEqual({});
  });
});

describe('parseBrouterResponse', () => {
  const fixtures = [
    'brouter-trekking-munich',
    'brouter-hiking-alps',
    'brouter-road-quiet-munich',
    'brouter-shortest-munich',
  ] as const;

  it.each(fixtures)('liest %s vollständig ein', (name) => {
    const route = routeFromFixture(name);

    expect(route.points.length).toBeGreaterThan(10);
    expect(route.segments.length).toBeGreaterThan(5);
    expect(route.metrics.distance).toBeGreaterThan(1000);

    for (const point of route.points) {
      expect(Number.isFinite(point.lng)).toBe(true);
      expect(Number.isFinite(point.lat)).toBe(true);
      expect(Number.isFinite(point.ele)).toBe(true);
    }
  });

  it.each(fixtures)('ordnet in %s jedes Wegstück einem Geometriepunkt zu', (name) => {
    const route = routeFromFixture(name);

    let previous = -1;
    for (const segment of route.segments) {
      expect(segment.pointIndex).toBeGreaterThanOrEqual(previous);
      expect(segment.pointIndex).toBeLessThan(route.points.length);
      previous = segment.pointIndex;
    }

    // Das letzte Wegstück endet am Ziel.
    expect(route.segments.at(-1)?.pointIndex).toBe(route.points.length - 1);
  });

  it('summiert die Wegstücke exakt auf die gemeldete Streckenlänge', () => {
    const payload = loadFixture('brouter-trekking-munich') as {
      features: { properties: Record<string, string> }[];
    };
    const declared = Number(payload.features[0]!.properties['track-length']);
    const route = routeFromFixture('brouter-trekking-munich');

    const summed = route.segments.reduce((total, segment) => total + segment.distance, 0);
    expect(summed).toBe(declared);
    expect(route.metrics.distance).toBe(declared);
  });

  it('leitet Höhenmeter aus gefiltertem Anstieg und Netto-Differenz ab', () => {
    const route = routeFromFixture('brouter-trekking-munich');

    // filtered ascend 9, plain-ascend -32 → 9 hinauf, 41 hinunter.
    expect(route.metrics.ascent).toBe(9);
    expect(route.metrics.descent).toBe(41);

    const alpine = routeFromFixture('brouter-hiking-alps', 'hiking');
    expect(alpine.metrics.ascent).toBe(344);
    expect(alpine.metrics.descent).toBe(110);
  });

  it('übersetzt Abbiegehinweise samt Richtung', () => {
    const route = routeFromFixture('brouter-trekking-munich');
    expect(route.instructions.length).toBeGreaterThan(10);

    for (const instruction of route.instructions) {
      expect(instruction.pointIndex).toBeLessThan(route.points.length);
      expect(instruction.distanceFromStart).toBeGreaterThanOrEqual(0);
    }

    // Linkskommandos haben negative, Rechtskommandos positive Winkel.
    for (const instruction of route.instructions) {
      if (instruction.command === 'left' || instruction.command === 'sharp-left') {
        expect(instruction.angle).toBeLessThan(0);
      }
      if (instruction.command === 'right' || instruction.command === 'sharp-right') {
        expect(instruction.angle).toBeGreaterThan(0);
      }
    }
  });

  it('kommt ohne Abbiegehinweise aus', () => {
    // hiking-beta liefert keine voicehints.
    const route = routeFromFixture('brouter-hiking-alps', 'hiking');
    expect(route.instructions).toEqual([]);
  });

  it('meldet eine leere Antwort als Fehler', () => {
    expect(() =>
      parseBrouterResponse(
        { features: [] },
        {
          id: 'x',
          sport: 'road',
          preference: 'fastest',
          profile: 'trekking',
          waypoints: [],
        },
      ),
    ).toThrow(BrouterError);
  });
});

describe('translateBrouterError', () => {
  it('erklärt nicht erreichbare Punkte', () => {
    expect(translateBrouterError('position not mapped in existing datafile')).toMatch(
      /zu weit von einem Weg/,
    );
  });

  it('hat eine allgemeine Meldung für Unbekanntes', () => {
    expect(translateBrouterError('irgendwas anderes')).toMatch(/keine Route berechnen/);
  });
});
