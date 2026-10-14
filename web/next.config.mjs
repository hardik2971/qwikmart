/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NEXT_DIST_DIR lets a verification build run beside a `next dev` server without touching its .next folder.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    // Images are absolute URLs from Firebase Storage (or the emulator) and placehold.co in mock mode.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
