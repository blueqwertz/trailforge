'use client';

import { compareRoutes, type Route, type RouteComparison } from '@trailforge/core';
import { useLocale, useTranslations } from 'next-intl';

import { formatDistance, formatDuration, formatPercent } from '@/lib/format';
import { usePlanner } from '@/lib/planner-store';

/**
 * Die übrigen Kandidaten mit dem Unterschied zur Empfehlung.
 *
 * Ohne diesen Vergleich bliebe die Auswahl des Rankings eine Behauptung. Mit
 * ihm steht dort „3,1 km länger, 40 % weniger Verkehr", und die Entscheidung
 * liegt wieder beim Nutzer.
 */
export function Alternatives() {
  const t = useTranslations();
  const { state, dispatch } = usePlanner();

  if (!state.route || state.alternatives.length === 0) return null;
  const best = state.route;

  return (
    <section>
      <h2 className="text-ink-faint mb-2 text-[11px] font-medium uppercase tracking-[0.08em]">
        {t('alternatives.label')}
      </h2>

      <ul className="flex flex-col gap-1">
        {state.alternatives.map((alternative) => (
          <li key={alternative.id}>
            <AlternativeButton
              alternative={alternative}
              comparison={compareRoutes(alternative, best)}
              onSelect={() => dispatch({ type: 'selectAlternative', id: alternative.id })}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AlternativeButton({
  alternative,
  comparison,
  onSelect,
}: {
  alternative: Route;
  comparison: RouteComparison;
  onSelect: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();

  const differences = describe(comparison, locale, t);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="border-border-ui hover:bg-hover w-full rounded-md border px-2.5 py-2 text-left transition-colors duration-150"
    >
      <span className="tnum text-ink flex items-baseline justify-between text-[13px]">
        {formatDistance(alternative.metrics.distance, locale)}
        <span className="text-ink-muted text-[12px]">
          {formatDuration(alternative.metrics.duration, locale)}
        </span>
      </span>

      <span className="text-ink-muted mt-0.5 block text-[11px] leading-snug">
        {differences.length > 0 ? differences.join(' · ') : t('alternatives.identical')}
      </span>
    </button>
  );
}

/**
 * Beschreibt nur, was sich spürbar unterscheidet. Ein Unterschied von 200 m
 * oder zwei Prozentpunkten hilft bei der Entscheidung nicht weiter.
 */
function describe(
  comparison: RouteComparison,
  locale: string,
  t: ReturnType<typeof useTranslations>,
): string[] {
  const parts: string[] = [];

  if (Math.abs(comparison.distanceDelta) >= 300) {
    const value = formatDistance(Math.abs(comparison.distanceDelta), locale);
    parts.push(
      t(comparison.distanceDelta > 0 ? 'alternatives.longer' : 'alternatives.shorter', { value }),
    );
  }

  if (Math.abs(comparison.durationDelta) >= 300) {
    const value = formatDuration(Math.abs(comparison.durationDelta), locale);
    parts.push(
      t(comparison.durationDelta > 0 ? 'alternatives.slower' : 'alternatives.faster', { value }),
    );
  }

  if (Math.abs(comparison.trafficDelta) >= 0.03) {
    const value = formatPercent(Math.abs(comparison.trafficDelta), locale);
    parts.push(
      t(comparison.trafficDelta > 0 ? 'alternatives.moreTraffic' : 'alternatives.lessTraffic', {
        value,
      }),
    );
  }

  if (Math.abs(comparison.natureDelta) >= 0.05) {
    const value = formatPercent(Math.abs(comparison.natureDelta), locale);
    parts.push(
      t(comparison.natureDelta > 0 ? 'alternatives.moreNature' : 'alternatives.lessNature', {
        value,
      }),
    );
  }

  return parts;
}
