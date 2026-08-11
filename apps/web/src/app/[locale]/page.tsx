import { setRequestLocale } from 'next-intl/server';

import { Planner } from '@/components/planner';

export default async function PlannerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <Planner />;
}
