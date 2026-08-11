import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // @trailforge/core wird als TypeScript-Quelle eingebunden, ohne Build-Schritt.
  // So bleibt dasselbe Paket später auch für eine React-Native-App nutzbar.
  transpilePackages: ['@trailforge/core'],
};

export default withNextIntl(nextConfig);
