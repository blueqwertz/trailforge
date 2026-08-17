import { BrouterError, planRoute, type RouteResult } from '@trailforge/core';
import { NextResponse } from 'next/server';

import {
  routeRequestSchema,
  toRouteDto,
  type ErrorResponseBody,
  type RouteRequestBody,
  type RouteResponseBody,
} from '@/lib/api-schema';
import { RateLimiter, TtlCache } from '@/lib/server/cache';

/**
 * Routing-Proxy.
 *
 * Der Browser spricht nie unmittelbar mit BRouter. Das hat drei Gründe: der
 * Zwischenspeicher wirkt nur zentral, die Zugriffsbremse ebenso, und die
 * Kennzahlen entstehen aus den Tags jedes Wegstücks, die hier ausgewertet und
 * nicht mitgeschickt werden.
 */

export const runtime = 'nodejs';

const cache = new TtlCache<RouteResponseBody>(500, 60 * 60 * 1000);
const limiter = new RateLimiter(30, 60 * 1000);

export async function POST(request: Request): Promise<NextResponse> {
  const limit = limiter.check(clientKey(request));
  if (!limit.allowed) {
    return errorResponse('errors.service', 429, {
      'Retry-After': String(limit.retryAfterSeconds),
    });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse('errors.generic', 400);
  }

  const parsed = routeRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse('errors.generic', 400);
  }

  const key = cacheKey(parsed.data);
  const cached = cache.get(key);
  if (cached) {
    return NextResponse.json(cached, { headers: { 'X-Cache': 'hit' } });
  }

  try {
    const result = await planRoute(parsed.data, {
      timeoutMs: 45_000,
      // Ohne eigene Adresse bleibt es beim öffentlichen Dienst; für den
      // Dauerbetrieb siehe docs/self-hosting.md.
      ...(process.env['BROUTER_BASE_URL'] ? { baseUrl: process.env['BROUTER_BASE_URL'] } : {}),
    });
    const body = toResponseBody(result);
    cache.set(key, body);
    return NextResponse.json(body, { headers: { 'X-Cache': 'miss' } });
  } catch (error) {
    return errorResponse(errorKeyFor(error), 502);
  }
}

function toResponseBody(result: RouteResult): RouteResponseBody {
  return {
    best: toRouteDto(result.best),
    // Mehr als drei Alternativen kann niemand sinnvoll vergleichen.
    alternatives: result.alternatives.slice(0, 3).map(toRouteDto),
  };
}

/**
 * Auf fünf Nachkommastellen gerundet, das entspricht rund einem Meter.
 * Feiner zu unterscheiden hieße, den Zwischenspeicher nutzlos zu machen: beim
 * Ziehen eines Wegpunktes entstünde sonst für jede Zwischenposition ein
 * eigener Eintrag.
 */
function cacheKey(request: RouteRequestBody): string {
  const waypoints = request.waypoints
    .map((point) => `${point.lng.toFixed(5)},${point.lat.toFixed(5)}`)
    .join('|');
  return `${request.sport}:${request.preference}:${waypoints}`;
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unbekannt';
}

/** Ordnet die Fehler des Routing-Dienstes den Meldungen der Oberfläche zu. */
function errorKeyFor(error: unknown): string {
  if (!(error instanceof BrouterError)) return 'errors.service';

  const message = error.message.toLowerCase();
  if (message.includes('zu weit von einem weg')) return 'errors.unreachable';
  if (message.includes('durchgehende verbindung')) return 'errors.noConnection';
  if (message.includes('zu lang')) return 'errors.tooLong';
  return 'errors.generic';
}

function errorResponse(
  errorKey: string,
  status: number,
  headers?: Record<string, string>,
): NextResponse {
  const body: ErrorResponseBody = { errorKey };
  return NextResponse.json(body, { status, headers: headers ?? {} });
}
