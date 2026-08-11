import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBrfParameters } from '../src/brf-parser.js';

const testDir = dirname(fileURLToPath(import.meta.url));

function readFixture(name: string): string {
  return readFileSync(join(testDir, 'fixtures', 'profiles', name), 'utf8');
}

function byName(source: string) {
  return new Map(parseBrfParameters(source).map((param) => [param.name, param]));
}

describe('parseBrfParameters', () => {
  it('findet die ausgewiesenen booleschen Schalter im trekking-Profil', () => {
    const params = byName(readFixture('trekking.brf'));

    for (const name of [
      'consider_forest',
      'consider_river',
      'consider_noise',
      'consider_traffic',
      'avoid_unsafe',
    ]) {
      const param = params.get(name);
      expect(param, `${name} sollte gefunden werden`).toBeDefined();
      expect(param?.type).toBe('boolean');
      expect(param?.documented).toBe(true);
    }
  });

  it('erkennt numerische Parameter im trekking-Profil', () => {
    const downhillcost = byName(readFixture('trekking.brf')).get('downhillcost');

    expect(downhillcost).toBeDefined();
    expect(downhillcost?.type).toBe('number');
    // Später im Profil steht `assign downhillcost = if consider_elevation …`.
    // Maßgeblich ist die erste Deklaration mit festem Wert.
    expect(downhillcost?.defaultValue).toBe('60');
  });

  it('erfasst auch Variablen ohne %name%-Marker und kennzeichnet sie', () => {
    const params = byName(readFixture('trekking.brf'));

    // Der Marker ist ein Hinweis für Bedienoberflächen, keine Bedingung für die
    // Überschreibbarkeit über `profile:<name>=<wert>`.
    const validForBikes = params.get('validForBikes');
    expect(validForBikes).toBeDefined();
    expect(validForBikes?.documented).toBe(false);
  });

  it('liest das ältere assign-Format ohne Gleichheitszeichen', () => {
    // hiking-beta verwendet durchgehend `assign name wert` und trägt keinen
    // einzigen Marker — seine Variablen sind trotzdem überschreibbar.
    const params = byName(readFixture('hiking-beta.brf'));

    expect(params.size).toBeGreaterThan(20);

    const shortestWay = params.get('shortest_way');
    expect(shortestWay).toBeDefined();
    expect(shortestWay?.type).toBe('number');
    expect(shortestWay?.defaultValue).toBe('0');
    expect(shortestWay?.documented).toBe(false);

    expect(params.get('stick_to_hiking_routes')).toBeDefined();
    expect(params.get('SAC_scale_limit')?.defaultValue).toBe('3');
  });

  it('überspringt abgeleitete Ausdrücke ohne festen Wert', () => {
    const params = byName(readFixture('hiking-beta.brf'));

    // `assign hr_preferred or prefer_hiking_routes stick_to_hiking_routes`
    // berechnet sich aus anderen Variablen und ist nicht sinnvoll setzbar.
    expect(params.has('hr_preferred')).toBe(false);
  });

  it('nimmt nur Zuweisungen aus dem globalen Abschnitt', () => {
    const source = [
      '---context:global',
      'assign consider_forest = false # %consider_forest% | Wald | boolean',
      '---context:way',
      'assign turncost = 40',
      '---context:node',
      'assign initialcost = 20',
    ].join('\n');

    const params = byName(source);
    expect([...params.keys()]).toEqual(['consider_forest']);
  });

  it('liefert keine doppelten Namen', () => {
    const names = parseBrfParameters(readFixture('trekking.brf')).map((param) => param.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('leitet den Typ aus dem Standardwert ab, wenn das Typ-Feld fehlt', () => {
    const params = byName(
      [
        'assign someBoolean = true # %someBoolean% | Ein boolescher Wert ohne Typ-Feld',
        'assign someNumber  = 42   # %someNumber% | Eine Zahl ohne Typ-Feld',
        'assign plainNumber 7      # ohne Marker, älteres Format',
      ].join('\n'),
    );

    expect(params.get('someBoolean')?.type).toBe('boolean');
    expect(params.get('someNumber')?.type).toBe('number');
    expect(params.get('plainNumber')?.type).toBe('number');
    expect(params.get('plainNumber')?.description).toBe('ohne Marker, älteres Format');
  });

  it('übernimmt den im Marker angegebenen Typ', () => {
    const params = byName('assign mode = 1 # %mode% | Betriebsart | string');
    expect(params.get('mode')?.type).toBe('string');
  });
});
