'use client';

import { PREFERENCES, SPORTS, type Preference, type Sport } from '@trailforge/core';
import { Bike, Footprints, MapPin, Mountain, MountainSnow, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alternatives } from '@/components/alternatives';
import { MetricsDetail } from '@/components/metrics-detail';
import { RouteActions } from '@/components/route-actions';
import { RouteSummary } from '@/components/route-summary';
import { SegmentedControl, type SegmentedOption } from '@/components/segmented-control';
import { usePlanner } from '@/lib/planner-store';

/**
 * Für Mountainbiken gibt es in lucide kein eigenes Symbol; das Gebirge steht
 * hier für das Gelände, das Fahrrad für die Straße. Zusammen mit Beschriftung
 * und Akzentfarbe reicht das — ein bemühtes Ersatzsymbol wäre schlechter.
 */
const SPORT_ICONS: Record<Sport, React.ReactNode> = {
  hiking: <Mountain size={15} strokeWidth={1.75} aria-hidden />,
  running: <Footprints size={15} strokeWidth={1.75} aria-hidden />,
  road: <Bike size={15} strokeWidth={1.75} aria-hidden />,
  mtb: <MountainSnow size={15} strokeWidth={1.75} aria-hidden />,
};

export function Sidebar() {
  const t = useTranslations();
  const { state, dispatch } = usePlanner();

  const sportOptions: SegmentedOption<Sport>[] = SPORTS.map((sport) => ({
    value: sport,
    label: t(`sport.${sport}`),
    icon: SPORT_ICONS[sport],
  }));

  const preferenceOptions: SegmentedOption<Preference>[] = PREFERENCES.map((preference) => ({
    value: preference,
    label: t(`preference.${preference}`),
    description: t(`preference.description.${preference}`),
  }));

  return (
    <>
      {/*
       * Der Inhalt rollt, die Aktionen bleiben stehen. Der GPX-Export ist das
       * Ziel des ganzen Ablaufs und darf nicht unter der Falz verschwinden,
       * sobald die Kennzahlen dazukommen.
       */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <SegmentedControl
          label={t('sport.label')}
          options={sportOptions}
          value={state.sport}
          onChange={(sport) => dispatch({ type: 'setSport', sport })}
        />

        <SegmentedControl
          label={t('preference.label')}
          options={preferenceOptions}
          value={state.preference}
          onChange={(preference) => dispatch({ type: 'setPreference', preference })}
        />

        <p className="text-ink-muted -mt-3 text-[12px] leading-snug">
          {t(`preference.description.${state.preference}`)}
        </p>

        <WaypointList />

        <RouteSummary />
        <MetricsDetail />
        <Alternatives />
      </div>

      {state.route ? (
        <div className="border-border-ui border-t p-3">
          <RouteActions />
        </div>
      ) : null}
    </>
  );
}

function WaypointList() {
  const t = useTranslations();
  const { state, dispatch } = usePlanner();

  if (state.waypoints.length === 0) {
    return (
      <div className="border-border-strong text-ink-muted rounded-md border border-dashed px-3 py-4 text-[12px] leading-snug">
        {t('waypoints.empty')}
      </div>
    );
  }

  const lastIndex = state.waypoints.length - 1;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-ink-faint text-[11px] font-medium uppercase tracking-[0.08em]">
          {t('waypoints.label')}
        </h2>
        <button
          type="button"
          onClick={() => dispatch({ type: 'clearWaypoints' })}
          className="text-ink-muted hover:text-ink text-[12px] transition-colors duration-150"
        >
          {t('waypoints.clear')}
        </button>
      </div>

      <ol className="flex flex-col">
        {state.waypoints.map((waypoint, index) => {
          const role =
            index === 0
              ? t('waypoints.start')
              : index === lastIndex
                ? t('waypoints.destination')
                : t('waypoints.via');

          return (
            <li
              key={`${waypoint.lng},${waypoint.lat},${index}`}
              className="hover:bg-hover group flex items-center gap-2 rounded-md px-1.5 py-1.5"
            >
              <MapPin
                size={14}
                strokeWidth={1.75}
                aria-hidden
                className={
                  index === 0 || index === lastIndex ? 'text-[var(--accent)]' : 'text-ink-faint'
                }
              />
              <span className="text-ink-muted w-16 shrink-0 text-[12px]">{role}</span>
              <span className="tnum text-ink flex-1 truncate text-[12px]">
                {waypoint.lat.toFixed(4)}, {waypoint.lng.toFixed(4)}
              </span>
              <button
                type="button"
                aria-label={t('waypoints.remove')}
                onClick={() => dispatch({ type: 'removeWaypoint', index })}
                className="text-ink-faint hover:text-danger rounded p-1 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            </li>
          );
        })}
      </ol>

      {state.waypoints.length === 1 ? (
        <p className="text-ink-muted mt-2 px-1.5 text-[12px] leading-snug">{t('waypoints.hint')}</p>
      ) : null}
    </section>
  );
}
