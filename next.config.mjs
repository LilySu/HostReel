/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  // better-sqlite3 and fluent-ffmpeg are native/CLI deps — keep them external
  serverExternalPackages: ['better-sqlite3', 'fluent-ffmpeg'],
};

export default nextConfig;
