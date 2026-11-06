/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NEXT_DIST_DIR lets a verification build run beside a `next dev` server without touching its .next folder.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    // Catalogue images are full-size uploads in Firebase Storage: let Next resize them to the rendered size and
    // serve WebP (cached for 30 days). Note: Firebase App Hosting builds turn this off and serve the originals;
    // it applies to local / self-hosted runs.
    formats: ['image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [640, 828, 1080, 1280, 1600, 1920],
    imageSizes: [48, 64, 96, 128, 160, 220, 320, 420],
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'localhost' },
    ],
    // placehold.co returns SVG in mock mode
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
