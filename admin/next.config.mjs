/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // separate build dirs (e.g. QA build next to a running `next dev`): NEXT_DIST_DIR=.next-qa npm run build
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  async redirects() {
    return [
      { source: '/', destination: '/admin', permanent: false },
      { source: '/admin', destination: '/admin/dashboard', permanent: false },
      { source: '/store', destination: '/store/dashboard', permanent: false },
      { source: '/delivery', destination: '/delivery/dashboard', permanent: false },
    ];
  },
};
export default nextConfig;
