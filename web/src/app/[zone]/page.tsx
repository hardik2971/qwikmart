import HomeView from '@/components/home/HomeView';

export default async function ZoneHomePage({ params }: { params: Promise<{ zone: string }> }) {
  const { zone } = await params;
  return <HomeView zone={decodeURIComponent(zone).toLowerCase()} />;
}
