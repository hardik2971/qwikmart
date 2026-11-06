import HomeView from '@/components/home/HomeView';
import { fetchDefaultHome } from '@/lib/fb/home';

// The default storefront (quick mode, no zone yet) is prerendered with its products and refreshed every minute,
// so first-time visitors see the catalogue in the HTML instead of a skeleton.
export const revalidate = 60;

export default async function HomePage() {
  const initial = await fetchDefaultHome();
  return <HomeView initial={initial} />;
}
