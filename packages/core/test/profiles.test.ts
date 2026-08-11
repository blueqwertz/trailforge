import { BROUTER_PROFILE_NAMES, profileSupportsParameter } from '../src/brouter-profiles.generated';
import {
  buildCandidates,
  candidateSignature,
  sanitizeParameters,
  usedProfiles,
} from '../src/profiles';
import { PREFERENCES, SPORTS } from '../src/types';

describe('Profilmatrix', () => {
  it('verwendet nur Profile, die es auf dem Server auch gibt', () => {
    for (const profile of usedProfiles()) {
      expect(BROUTER_PROFILE_NAMES).toContain(profile);
    }
  });

  it.each(SPORTS.flatMap((sport) => PREFERENCES.map((preference) => [sport, preference] as const)))(
    'liefert für %s/%s mehrere unterscheidbare Anfragen',
    (sport, preference) => {
      const candidates = buildCandidates(sport, preference);
      expect(candidates.length).toBeGreaterThanOrEqual(2);

      // Der eigentliche Zweck dieser Prüfung: Parameter, die ein Profil nicht
      // kennt, werden herausgefiltert. Ohne diese Zusicherung können mehrere
      // Kandidaten unbemerkt zur identischen Anfrage zusammenfallen — dann
      // liefert die Präferenz keinerlei Wirkung mehr.
      const signatures = new Set(candidates.map(candidateSignature));
      expect(signatures.size).toBe(candidates.length);
    },
  );

  it('schickt keinen Parameter, den das Profil nicht kennt', () => {
    for (const sport of SPORTS) {
      for (const preference of PREFERENCES) {
        for (const candidate of buildCandidates(sport, preference)) {
          for (const name of Object.keys(candidate.parameters)) {
            expect(profileSupportsParameter(candidate.profile, name)).toBe(true);
          }
        }
      }
    }
  });

  it('fordert Abbiegehinweise an, wo das Profil sie unterstützt', () => {
    const candidates = buildCandidates('road', 'fastest');
    for (const candidate of candidates) {
      if (profileSupportsParameter(candidate.profile, 'turnInstructionMode')) {
        expect(candidate.parameters['turnInstructionMode']).toBe(3);
      }
    }
  });

  it('bleibt bei jeder Präferenz auf höchstens vier Anfragen', () => {
    // Jeder Kandidat ist eine Anfrage an einen ehrenamtlich betriebenen Server.
    for (const sport of SPORTS) {
      for (const preference of PREFERENCES) {
        expect(buildCandidates(sport, preference).length).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe('sanitizeParameters', () => {
  it('behält unterstützte Parameter', () => {
    expect(sanitizeParameters('trekking', { avoid_unsafe: true, consider_forest: true })).toEqual({
      avoid_unsafe: true,
      consider_forest: true,
    });
  });

  it('verwirft, was das Profil nicht kennt', () => {
    // hiking-beta kennt `shortest_way`, aber weder `consider_forest` noch
    // `avoid_unsafe` — beides gibt es dort schlicht nicht.
    expect(
      sanitizeParameters('hiking-beta', {
        shortest_way: true,
        consider_forest: true,
        avoid_unsafe: true,
      }),
    ).toEqual({ shortest_way: true });

    // Das Gravel-Profil benennt dieselbe Idee anders.
    expect(sanitizeParameters('gravel', { consider_forest: true, prefer_forests: true })).toEqual({
      prefer_forests: true,
    });
  });
});
