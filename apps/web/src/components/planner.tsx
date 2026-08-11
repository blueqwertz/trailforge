'use client';

import { useTranslations } from 'next-intl';

import { Sidebar } from '@/components/sidebar';
import { PlannerProvider, usePlanner } from '@/lib/planner-store';

/**
 * Rahmen der Anwendung: Karte über die volle Fläche, Bedienung als
 * schwebendes Feld darüber. Auf schmalen Geräten wird daraus ein Blatt am
 * unteren Rand — die Karte bleibt in beiden Fällen die Hauptsache.
 */
export function Planner() {
  return (
    <PlannerProvider>
      <PlannerLayout />
    </PlannerProvider>
  );
}

function PlannerLayout() {
  const t = useTranslations();
  const { state } = usePlanner();

  return (
    <div data-sport={state.sport} className="bg-bg relative h-dvh w-full overflow-hidden">
      <div className="absolute inset-0">
        <MapPlaceholder />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
        <div className="border-border-ui bg-panel pointer-events-auto flex items-center gap-2 rounded-[var(--radius-panel)] border px-3 py-2 shadow-[var(--ui-shadow)]">
          <span className="text-[13px] font-semibold tracking-tight">{t('app.name')}</span>
          <span aria-hidden className="bg-border-strong h-3.5 w-px" />
          <span className="text-ink-muted text-[12px]">{t(`sport.${state.sport}`)}</span>
        </div>
      </header>

      <aside className="border-border-ui bg-panel absolute bottom-4 left-3 top-16 z-10 flex w-[320px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[var(--radius-panel)] border shadow-[var(--ui-shadow)]">
        <Sidebar />
      </aside>

      <footer className="text-ink-faint pointer-events-none absolute bottom-3 right-3 z-10 text-[11px]">
        <span className="bg-panel/80 pointer-events-auto rounded px-1.5 py-0.5 backdrop-blur-sm">
          {t('app.attribution')}
        </span>
      </footer>
    </div>
  );
}

/** Platzhalter, bis die Karte eingebunden ist. */
function MapPlaceholder() {
  return (
    <div
      aria-hidden
      className="h-full w-full"
      style={{
        backgroundColor: 'var(--color-base-100)',
        backgroundImage:
          'linear-gradient(var(--color-base-200) 1px, transparent 1px), linear-gradient(90deg, var(--color-base-200) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }}
    />
  );
}
