import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from 'next/font/google';
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

// Headlines: a grotesque with character for the brand voice; body copy stays in Jakarta.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
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
  themeColor: '#0A1B4D',
  width: 'device-width',
  initialScale: 1,
};

// Hosts the first page view talks to (callables, Firestore, guest sign-in, product images): open the
// connections while the JS bundle is still downloading.
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const PRECONNECT = PROJECT_ID
  ? [
      `https://asia-south1-${PROJECT_ID}.cloudfunctions.net`,
      'https://firestore.googleapis.com',
      'https://identitytoolkit.googleapis.com',
    ]
  : [];
// Firebase App Hosting serves next/image unoptimized, so product images load straight from Storage. They are plain
// <img> requests (no CORS), so their connection must not be opened as crossorigin.
const IMAGE_HOST = 'https://firebasestorage.googleapis.com';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={`${jakarta.variable} ${display.variable}`}>
      <head>
        {PRECONNECT.map((href) => (
          <link key={href} rel="preconnect" href={href} crossOrigin="anonymous" />
        ))}
        {PROJECT_ID && <link rel="preconnect" href={IMAGE_HOST} />}
      </head>
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
