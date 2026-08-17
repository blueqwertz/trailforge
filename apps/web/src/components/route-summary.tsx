'use client';

import { ArrowDownRight, ArrowUpRight, Clock, Ruler } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { formatDistance, formatDuration, formatElevation } from '@/lib/format';
import { usePlanner } from '@/lib/planner-store';

/** Die vier Zahlen, nach denen zuerst gesehen wird. */
export function RouteSummary() {
  const t = useTranslations();
  const locale = useLocale();
  const { state } = usePlanner();

  if (state.status === 'loading') {
    return (
      <div className="border-border-ui text-ink-muted flex items-center gap-2 rounded-md border px-3 py-3 text-[12px]">
        <span
          aria-hidden
          className="border-border-strong h-3 w-3 animate-spin rounded-full border-[1.5px] border-t-[var(--accent)]"
        />
        {t('status.calculating')}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="border-danger/30 bg-danger/5 rounded-md border px-3 py-3">
        <p className="text-danger text-[12px] font-medium">{t('errors.title')}</p>
        <p className="text-ink-muted mt-1 text-[12px] leading-snug">
          {state.errorKey ? t(state.errorKey) : t('errors.generic')}
        </p>
      </div>
    );
  }

  if (!state.route) return null;

  const { metrics } = state.route;

  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      <Figure
        icon={<Ruler size={13} strokeWidth={1.75} aria-hidden />}
        label={t('metrics.distance')}
        value={formatDistance(metrics.distance, locale)}
        emphasis
      />
      <Figure
        icon={<Clock size={13} strokeWidth={1.75} aria-hidden />}
        label={t('metrics.duration')}
        value={formatDuration(metrics.duration, locale)}
        emphasis
      />
      <Figure
        icon={<ArrowUpRight size={13} strokeWidth={1.75} aria-hidden />}
        label={t('metrics.ascent')}
        value={formatElevation(metrics.ascent, locale)}
      />
      <Figure
        icon={<ArrowDownRight size={13} strokeWidth={1.75} aria-hidden />}
        label={t('metrics.descent')}
        value={formatElevation(metrics.descent, locale)}
      />
    </dl>
  );
}

function Figure({
  icon,
  label,
  value,
  emphasis = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="text-ink-faint flex items-center gap-1 text-[11px]">
        {icon}
        {label}
      </dt>
      <dd className={`tnum mt-0.5 ${emphasis ? 'text-[19px]' : 'text-[15px]'} text-ink`}>
        {value}
      </dd>
    </div>
  );
}
