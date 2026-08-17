'use client';

import type { RouteMetrics, SurfaceBreakdown } from '@trailforge/core';
import { useLocale, useTranslations } from 'next-intl';

import { formatPercent } from '@/lib/format';
import { usePlanner } from '@/lib/planner-store';

/**
 * Die Zahlen hinter der Präferenz.
 *
 * Sie sind der Beleg dafür, dass „ruhigste" und „schönste" mehr sind als
 * Beschriftungen: der Verkehrswert und der Naturweganteil ändern sich sichtbar,
 * wenn man zwischen den Präferenzen wechselt.
 */

const SURFACE_ORDER: (keyof SurfaceBreakdown)[] = ['paved', 'compacted', 'natural', 'unknown'];

const SURFACE_COLORS: Record<keyof SurfaceBreakdown, string> = {
  paved: 'var(--color-surface-paved)',
  compacted: 'var(--color-surface-compacted)',
  natural: 'var(--color-surface-natural)',
  unknown: 'var(--color-surface-unknown)',
};

export function MetricsDetail() {
  const t = useTranslations();
  const locale = useLocale();
  const { state } = usePlanner();

  if (!state.route) return null;
  const { metrics } = state.route;

  return (
    <section className="flex flex-col gap-3.5">
      <SurfaceBar metrics={metrics} />

      <div className="flex flex-col gap-2">
        <Meter
          label={t('metrics.traffic')}
          value={metrics.trafficExposure}
          formatted={formatPercent(metrics.trafficExposure, locale)}
          tone="warning"
        />
        <Meter
          label={t('metrics.nature')}
          value={metrics.natureShare}
          formatted={formatPercent(metrics.natureShare, locale)}
          tone="accent"
        />
        <Meter
          label={t('metrics.signed')}
          value={metrics.signedRouteShare}
          formatted={formatPercent(metrics.signedRouteShare, locale)}
          tone="accent"
        />
      </div>

      {metrics.maxSacScale !== null || metrics.maxMtbScale !== null ? (
        <div className="flex items-center gap-1.5">
          <span className="text-ink-faint text-[11px]">{t('metrics.difficulty')}</span>
          {metrics.maxSacScale !== null ? (
            <Badge>{t('metrics.sac', { level: metrics.maxSacScale })}</Badge>
          ) : null}
          {metrics.maxMtbScale !== null ? (
            <Badge>{t('metrics.mtbScale', { level: metrics.maxMtbScale })}</Badge>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SurfaceBar({ metrics }: { metrics: RouteMetrics }) {
  const t = useTranslations();
  const locale = useLocale();

  const total = SURFACE_ORDER.reduce((sum, kind) => sum + metrics.surface[kind], 0);
  if (total <= 0) return null;

  const parts = SURFACE_ORDER.map((kind) => ({
    kind,
    share: metrics.surface[kind] / total,
  })).filter((part) => part.share > 0.005);

  return (
    <div>
      <p className="text-ink-faint mb-1.5 text-[11px]">{t('metrics.surface')}</p>

      <div className="flex h-2 overflow-hidden rounded-full">
        {parts.map((part) => (
          <div
            key={part.kind}
            style={{ width: `${part.share * 100}%`, backgroundColor: SURFACE_COLORS[part.kind] }}
          />
        ))}
      </div>

      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {parts.map((part) => (
          <li key={part.kind} className="text-ink-muted flex items-center gap-1 text-[11px]">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: SURFACE_COLORS[part.kind] }}
            />
            {t(`metrics.surfaceKind.${part.kind}`)}
            <span className="tnum text-ink">{formatPercent(part.share, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meter({
  label,
  value,
  formatted,
  tone,
}: {
  label: string;
  value: number;
  formatted: string;
  tone: 'accent' | 'warning';
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-faint w-24 shrink-0 text-[11px]">{label}</span>
      <div className="bg-hover h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, value * 100))}%`,
            backgroundColor: tone === 'accent' ? 'var(--accent)' : 'var(--color-warning)',
          }}
        />
      </div>
      <span className="tnum text-ink w-9 shrink-0 text-right text-[11px]">{formatted}</span>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-border-strong text-ink rounded border px-1.5 py-0.5 text-[11px]">
      {children}
    </span>
  );
}
