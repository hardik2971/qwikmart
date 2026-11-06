import HomeView from '@/components/home/HomeView';
import { fetchDefaultHome } from '@/lib/fb/home';

export default async function ZoneHomePage({ params }: { params: Promise<{ zone: string }> }) {
  const { zone } = await params;
  // the cached default storefront fills the page while this zone's own catalogue loads in the browser
  const initial = await fetchDefaultHome();
  return <HomeView zone={decodeURIComponent(zone).toLowerCase()} initial={initial} />;
}
