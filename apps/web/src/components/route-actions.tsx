'use client';

import { gpxFileName, routeToGpx } from '@trailforge/core';
import { Check, Download, Link2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { usePlanner } from '@/lib/planner-store';

/**
 * GPX-Export und teilbarer Link.
 *
 * Die GPX-Datei entsteht im Browser: die Route liegt dort bereits vollständig
 * vor, und ein Umweg über den Server brächte nur Wartezeit.
 */
export function RouteActions() {
  const t = useTranslations();
  const locale = useLocale();
  const { state } = usePlanner();
  const [copied, setCopied] = useState(false);

  if (!state.route) return null;

  const download = () => {
    const route = state.route;
    if (!route) return;

    const gpx = routeToGpx(route, {
      description: `${t(`sport.${route.sport}`)} · ${t(`preference.${route.preference}`)} · TrailForge`,
      includeTurnInstructions: route.instructions.length > 0,
    });

    const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = gpxFileName(route);
    link.click();
    URL.revokeObjectURL(url);
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ohne Zugriff auf die Zwischenablage bleibt die Adresszeile der Weg.
      setCopied(false);
    }
  };

  return (
    <div className="flex gap-2" lang={locale}>
      <button
        type="button"
        onClick={download}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-2 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-90"
      >
        <Download size={14} strokeWidth={1.75} aria-hidden />
        {t('actions.download')}
      </button>

      <button
        type="button"
        onClick={share}
        aria-label={t('actions.share')}
        className="border-border-strong text-ink hover:bg-hover flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[13px] transition-colors duration-150"
      >
        {copied ? (
          <>
            <Check size={14} strokeWidth={1.75} aria-hidden />
            {t('actions.shareCopied')}
          </>
        ) : (
          <Link2 size={14} strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </div>
  );
}
