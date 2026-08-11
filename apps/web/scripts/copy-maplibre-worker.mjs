/**
 * Legt MapLibres Worker als statische Datei ab.
 *
 * MapLibre leitet die Adresse seines Workers zur Laufzeit aus `import.meta.url`
 * ab. Nach dem Bündeln zeigt diese Adresse in Turbopacks Chunk-Verzeichnis,
 * wo die Worker-Datei nicht liegt — der Worker startet dann nicht, und die
 * Karte lädt keine einzige Kachel, ohne dass ein Fehler in der Konsole
 * erkennbar wäre. Deshalb wird der Worker hier neben die übrigen statischen
 * Dateien kopiert und über `setWorkerUrl` ausdrücklich benannt.
 *
 * Der Worker ist ein ES-Modul und lädt `maplibre-gl-shared.mjs` relativ nach,
 * die deshalb mitkopiert werden muss.
 */

import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const distDir = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'));

const targetDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'public', 'maplibre');

const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

await mkdir(targetDir, { recursive: true });

for (const file of FILES) {
  await copyFile(join(distDir, file), join(targetDir, file));
  console.log(`kopiert: ${file}`);
}
