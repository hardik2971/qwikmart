import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';
import TopBar from '@/components/layout/TopBar';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import CookieBar from '@/components/layout/CookieBar';
import LocationModal from '@/components/layout/LocationModal';
import { DemoBadge, FloatingChat, MobileNav } from '@/components/layout/Chrome';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const TITLE = 'QwikMart — Groceries in minutes, everything else in days';
const DESCRIPTION =
  'Order groceries, fresh produce, daily essentials, electronics and fashion online. Delivery in 10 minutes with QwikMart.';

// Share image / favicon come from the file conventions in this folder:
// opengraph-image.png, twitter-image.png, icon.png, apple-icon.png, favicon.ico (firebase/tools/assets/build-web-brand.ts).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s | QwikMart' },
  description: DESCRIPTION,
  applicationName: 'QwikMart',
  openGraph: {
    type: 'website',
    siteName: 'QwikMart',
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    locale: 'en_IN',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: '#0E9623',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={jakarta.variable}>
      <body className="min-h-screen font-sans">
        <Providers>
          <TopBar />
          <Header />
          <main className="min-h-[60vh] pb-16 md:pb-0">{children}</main>
          <Footer />
          <LocationModal />
          <CookieBar />
          <FloatingChat />
          <DemoBadge />
          <MobileNav />
        </Providers>
      </body>
    </html>
  );
}
