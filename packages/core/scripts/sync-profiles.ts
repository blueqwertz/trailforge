/**
 * Lädt die BRouter-Profile herunter, mit denen TrailForge arbeitet, und
 * erzeugt daraus `src/brouter-profiles.generated.ts` — eine typisierte Map,
 * welcher Parameter von welchem Profil unterstützt wird.
 *
 * Ausführung: `pnpm --filter @trailforge/core profiles:sync`
 * (Node-Skript ohne Build-Schritt, per `node --experimental-strip-types`.)
 */

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBrfParameters, type BrfParameter } from '../src/brf-parser.ts';

const PROFILE_NAMES = [
  'trekking',
  'fastbike',
  'fastbike-lowtraffic',
  'fastbike-verylowtraffic',
  'racebike-verylowtraffic',
  'shortest',
  'hiking-beta',
  'hiking-mountain',
  'mtb',
  'MTB_SB_light',
  'gravel',
] as const;

const PROFILE_BASE_URL = 'https://brouter.de/brouter/profiles2/';
const USER_AGENT = 'TrailForge/0.1 (+https://github.com/blueqwertz/trailforge)';
const REQUEST_PAUSE_MS = 300;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputPath = join(scriptDir, '..', 'src', 'brouter-profiles.generated.ts');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchProfile(name: string): Promise<string> {
  const url = `${PROFILE_BASE_URL}${name}.brf`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(
      `Download von ${url} fehlgeschlagen: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

function formatParameter(param: BrfParameter): string {
  return `    { name: ${JSON.stringify(param.name)}, type: ${JSON.stringify(param.type)}, defaultValue: ${JSON.stringify(param.defaultValue)}, description: ${JSON.stringify(param.description)}, documented: ${String(param.documented)} }`;
}

function renderModule(profiles: ReadonlyMap<string, readonly BrfParameter[]>): string {
  const profileNames = [...profiles.keys()].sort((a, b) => a.localeCompare(b));

  const entries = profileNames
    .map((name) => {
      const params = profiles.get(name) ?? [];
      const sortedParams = [...params].sort((a, b) => a.name.localeCompare(b.name));
      const paramLines = sortedParams.map(formatParameter).join(',\n');
      return `  ${JSON.stringify(name)}: [\n${paramLines}\n  ]`;
    })
    .join(',\n');

  const namesArray = profileNames.map((name) => `  ${JSON.stringify(name)},`).join('\n');

  return `// Generiert von scripts/sync-profiles.ts — nicht von Hand bearbeiten.
import type { BrfParameter } from './brf-parser.js';

export const BROUTER_PROFILE_PARAMETERS: Readonly<Record<string, readonly BrfParameter[]>> = {
${entries}
};

export const BROUTER_PROFILE_NAMES = [
${namesArray}
] as const;
export type BrouterProfileName = (typeof BROUTER_PROFILE_NAMES)[number];

/** Prüft, ob ein Profil einen Parameter überhaupt kennt. */
export function profileSupportsParameter(profile: string, parameter: string): boolean {
  const params = BROUTER_PROFILE_PARAMETERS[profile];
  if (!params) {
    return false;
  }
  return params.some((param) => param.name === parameter);
}
`;
}

async function main(): Promise<void> {
  const profiles = new Map<string, readonly BrfParameter[]>();

  for (const name of PROFILE_NAMES) {
    const source = await fetchProfile(name);
    const params = parseBrfParameters(source);
    profiles.set(name, params);
    console.log(`${name}: ${params.length} Parameter`);

    if (name !== PROFILE_NAMES[PROFILE_NAMES.length - 1]) {
      await sleep(REQUEST_PAUSE_MS);
    }
  }

  const moduleSource = renderModule(profiles);
  await writeFile(outputPath, moduleSource, 'utf8');
  console.log(`Geschrieben: ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error('profiles:sync fehlgeschlagen:', error);
  process.exitCode = 1;
});
