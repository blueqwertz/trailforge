/**
 * Zahlenformate der Oberfläche.
 *
 * Alle Werte laufen über `Intl`, damit Dezimaltrennzeichen und
 * Tausenderpunkte zur Sprache passen. Die Einheiten sind bewusst fest:
 * Kilometer und Meter, keine Meilen — die Datengrundlage ist metrisch.
 */

export function formatDistance(meters: number, locale: string): string {
  if (!Number.isFinite(meters)) return '–';

  if (meters < 1000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(meters)} m`;
  }

  const kilometers = meters / 1000;
  const digits = kilometers < 100 ? 1 : 0;
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(kilometers)} km`;
}

/** Kurzform wie „2:15 h" oder „48 min". */
export function formatDuration(seconds: number, locale: string): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '–';

  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return `${new Intl.NumberFormat(locale).format(totalMinutes)} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${new Intl.NumberFormat(locale).format(hours)}:${String(minutes).padStart(2, '0')} h`;
}

export function formatElevation(meters: number, locale: string): string {
  if (!Number.isFinite(meters)) return '–';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(meters)} m`;
}

export function formatPercent(share: number, locale: string): string {
  if (!Number.isFinite(share)) return '–';
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(Math.min(1, Math.max(0, share)));
}

/** Vorzeichenbehaftete Differenz, etwa „+3,1 km". */
export function formatDistanceDelta(meters: number, locale: string): string {
  const sign = meters > 0 ? '+' : '−';
  return `${sign}${formatDistance(Math.abs(meters), locale)}`;
}
