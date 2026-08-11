/**
 * Liest die einstellbaren Variablen eines BRouter-Profils (`.brf`).
 *
 * BRouter-Profile deklarieren im globalen Abschnitt Variablen, die der Server
 * über Query-Parameter der Form `profile:<name>=<wert>` überschreibbar macht.
 * Zwei Schreibweisen kommen vor:
 *
 *     assign consider_forest = false  # %consider_forest% | Prefer forest | boolean
 *     assign consider_elevation 1     # 0 as default
 *
 * Die erste stammt aus den neueren Profilen und trägt mit `%name%` einen
 * Hinweis für Bedienoberflächen. Die zweite benutzen ältere Profile wie
 * `hiking-beta`, das dadurch keinen einzigen markierten Parameter besitzt —
 * seine Variablen sind trotzdem überschreibbar. Nachgemessen an brouter.de:
 * `profile:shortest_way=1` verkürzt eine Wanderroute von 9322 auf 8283 Meter,
 * `profile:turnInstructionMode=3` liefert Abbiegehinweise, wo vorher keine
 * kamen. Der Marker entscheidet also über die Dokumentation, nicht über die
 * Wirkung.
 *
 * Deshalb werden hier alle globalen Zuweisungen mit festem Wert erfasst;
 * `documented` hält fest, ob das Profil sie ausweist.
 */

export type BrfParameterType = 'boolean' | 'number' | 'string';

export interface BrfParameter {
  name: string;
  type: BrfParameterType;
  /** Standardwert als Zeichenkette, so wie er im Profil steht. */
  defaultValue: string;
  /** Beschreibung aus dem Profil, englisch. */
  description: string;
  /** Ob das Profil den Parameter mit `%name%` für Oberflächen ausweist. */
  documented: boolean;
}

const CONTEXT_MARKER = '---context:';

/** Kommentarform der neueren Profile: `%name% | Beschreibung | typ` */
const DOCUMENTED_COMMENT = /^%[\w:.]+%\s*\|\s*([^|]*?)\s*(?:\|\s*(\w+)\s*)?$/;

const VARIABLE_NAME = /^[A-Za-z_][\w:.]*$/;

/** Nur feste Werte sind von außen sinnvoll setzbar. */
const LITERAL_VALUE = /^-?(?:\d+(?:\.\d+)?|true|false)$/;

export function parseBrfParameters(source: string): BrfParameter[] {
  const parameters: BrfParameter[] = [];
  const seen = new Set<string>();

  // Vor dem ersten Kontextwechsel gilt der globale Abschnitt. Zuweisungen in
  // `---context:way` oder `---context:node` sind Ausdrücke über OSM-Tags und
  // dürfen nicht von außen überschrieben werden.
  let inGlobalContext = true;

  for (const rawLine of source.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();

    if (line.startsWith(CONTEXT_MARKER)) {
      const context = line.slice(CONTEXT_MARKER.length).trim().split(/[\s#]/)[0];
      inGlobalContext = context === 'global';
      continue;
    }

    if (!inGlobalContext || !line.startsWith('assign')) continue;

    const hash = line.indexOf('#');
    const code = (hash >= 0 ? line.slice(0, hash) : line).trim();
    const comment = hash >= 0 ? line.slice(hash + 1).trim() : '';

    const declaration = parseDeclaration(code);
    if (!declaration) continue;

    // Die erste Deklaration gewinnt. Spätere Zuweisungen an denselben Namen
    // sind abgeleitete Ausdrücke wie
    // `assign downhillcost = if consider_elevation then downhillcost else 0`.
    if (seen.has(declaration.name)) continue;
    seen.add(declaration.name);

    const documented = DOCUMENTED_COMMENT.exec(comment);

    parameters.push({
      name: declaration.name,
      type: resolveType(documented?.[2], declaration.value),
      defaultValue: declaration.value,
      description: (documented ? (documented[1] ?? '') : comment).trim(),
      documented: documented !== null,
    });
  }

  return parameters;
}

interface Declaration {
  name: string;
  value: string;
}

/**
 * Erkennt `assign name = wert` und `assign name wert`, aber keine abgeleiteten
 * Ausdrücke: `assign hr_preferred or prefer_hiking_routes stick_to_hiking_routes`
 * hat keinen festen Wert und ist von außen nicht sinnvoll setzbar.
 */
function parseDeclaration(code: string): Declaration | null {
  const tokens = code
    .slice('assign'.length)
    .replace(/=/g, ' = ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let name: string | undefined;
  let value: string | undefined;

  if (tokens.length === 3 && tokens[1] === '=') {
    name = tokens[0];
    value = tokens[2];
  } else if (tokens.length === 2) {
    name = tokens[0];
    value = tokens[1];
  }

  if (name === undefined || value === undefined) return null;
  if (!VARIABLE_NAME.test(name) || !LITERAL_VALUE.test(value)) return null;

  return { name, value };
}

function resolveType(declaredType: string | undefined, value: string): BrfParameterType {
  const normalized = declaredType?.toLowerCase();
  if (normalized === 'boolean' || normalized === 'number' || normalized === 'string') {
    return normalized;
  }
  if (value === 'true' || value === 'false') return 'boolean';
  return Number.isNaN(Number(value)) ? 'string' : 'number';
}
