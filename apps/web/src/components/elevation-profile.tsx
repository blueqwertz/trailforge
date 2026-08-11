'use client';

import { cumulativeDistances, smoothElevation, type Route } from '@trailforge/core';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import { formatDistance, formatElevation } from '@/lib/format';
import { usePlanner } from '@/lib/planner-store';

/**
 * Höhenprofil als eigenes SVG.
 *
 * Bewusst ohne Diagrammbibliothek: gebraucht wird genau eine Fläche mit einem
 * Zeiger, der sich mit der Karte abstimmt. Eine Bibliothek würde für diesen
 * einen Fall mehr Größe und mehr Abstraktion kosten, als sie einspart.
 *
 * Gezeichnet wird die geglättete Höhe. Die Rohwerte stammen aus SRTM und
 * rauschen um mehrere Meter — ungeglättet sähe eine flache Strecke aus wie
 * ein Sägeblatt.
 */

const HEIGHT = 96;
const PADDING_TOP = 10;
const PADDING_BOTTOM = 16;

/** Mehr Stützstellen als Bildpunkte bringen nichts. */
const MAX_SAMPLES = 600;

export function ElevationProfile() {
  const t = useTranslations();
  const locale = useLocale();
  const { state, dispatch } = usePlanner();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const profile = useMemo(
    () => (state.route ? buildProfile(state.route) : null),
    [state.route],
  );

  const geometry = useMemo(
    () => (profile && width > 0 ? buildPaths(profile, width) : null),
    [profile, width],
  );

  if (!state.route || !profile) return null;

  const hoverX =
    geometry && state.hoverDistance !== null
      ? (state.hoverDistance / profile.totalDistance) * width
      : null;

  const hoverElevation =
    state.hoverDistance !== null ? elevationAt(profile, state.hoverDistance) : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height: HEIGHT }}
      onPointerMove={(event) => {
        if (width <= 0) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
        dispatch({ type: 'setHoverDistance', distance: ratio * profile.totalDistance });
      }}
      onPointerLeave={() => dispatch({ type: 'setHoverDistance', distance: null })}
      role="img"
      aria-label={`${t('metrics.elevationProfile')}: ${formatElevation(profile.minElevation, locale)} bis ${formatElevation(profile.maxElevation, locale)}`}
    >
      {geometry ? (
        <svg width={width} height={HEIGHT} className="block">
          <defs>
            <linearGradient id="tf-elevation" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          <path d={geometry.area} fill="url(#tf-elevation)" />
          <path
            d={geometry.line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />

          {hoverX !== null ? (
            <line
              x1={hoverX}
              x2={hoverX}
              y1={0}
              y2={HEIGHT - PADDING_BOTTOM}
              stroke="var(--color-ink)"
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.5}
            />
          ) : null}
        </svg>
      ) : null}

      <div className="tnum pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-ink-faint">
        <span>{formatElevation(profile.minElevation, locale)}</span>
        {state.hoverDistance !== null && hoverElevation !== null ? (
          <span className="font-medium text-ink">
            {formatDistance(state.hoverDistance, locale)} · {formatElevation(hoverElevation, locale)}
          </span>
        ) : null}
        <span>{formatElevation(profile.maxElevation, locale)}</span>
      </div>
    </div>
  );
}

interface Profile {
  distances: number[];
  elevations: number[];
  totalDistance: number;
  minElevation: number;
  maxElevation: number;
}

function buildProfile(route: Route): Profile | null {
  if (route.points.length < 2) return null;

  const allDistances = cumulativeDistances(route.points);
  const allElevations = smoothElevation(route.points);
  const total = allDistances[allDistances.length - 1] ?? 0;
  if (total <= 0) return null;

  const step = Math.max(1, Math.ceil(route.points.length / MAX_SAMPLES));
  const distances: number[] = [];
  const elevations: number[] = [];

  for (let i = 0; i < route.points.length; i += step) {
    distances.push(allDistances[i]!);
    elevations.push(allElevations[i]!);
  }

  // Der Endpunkt darf beim Ausdünnen nicht verloren gehen.
  const lastIndex = route.points.length - 1;
  if (distances[distances.length - 1] !== allDistances[lastIndex]) {
    distances.push(allDistances[lastIndex]!);
    elevations.push(allElevations[lastIndex]!);
  }

  return {
    distances,
    elevations,
    totalDistance: total,
    minElevation: Math.min(...elevations),
    maxElevation: Math.max(...elevations),
  };
}

function buildPaths(profile: Profile, width: number): { line: string; area: string } {
  const { distances, elevations, totalDistance, minElevation, maxElevation } = profile;

  // Bei fast ebener Strecke würde die Kurve sonst willkürlich stark ausschlagen.
  const span = Math.max(20, maxElevation - minElevation);
  const usableHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const x = (distance: number) => (distance / totalDistance) * width;
  const y = (elevation: number) =>
    PADDING_TOP + usableHeight - ((elevation - minElevation) / span) * usableHeight;

  let line = '';
  for (let i = 0; i < distances.length; i++) {
    line += `${i === 0 ? 'M' : 'L'}${x(distances[i]!).toFixed(1)},${y(elevations[i]!).toFixed(1)}`;
  }

  const baseline = HEIGHT - PADDING_BOTTOM;
  const area = `${line}L${width.toFixed(1)},${baseline}L0,${baseline}Z`;

  return { line, area };
}

function elevationAt(profile: Profile, distance: number): number | null {
  const { distances, elevations } = profile;
  if (distances.length === 0) return null;

  let index = 0;
  while (index < distances.length - 1 && distances[index + 1]! < distance) index++;
  return elevations[index] ?? null;
}
