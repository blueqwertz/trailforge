import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

/**
 * Sprachauflösung. In Next 16 heißt die frühere `middleware`-Konvention
 * `proxy`; next-intl liefert die Umsetzung weiterhin unter dem alten Namen.
 */
export default createMiddleware(routing);

export const config = {
  // Alles außer API-Routen, Next-internen Pfaden und Dateien mit Endung.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
