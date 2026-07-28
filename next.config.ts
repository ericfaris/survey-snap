import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3, sharp and playwright are native/heavy — never bundle them.
  serverExternalPackages: ['better-sqlite3', 'sharp', 'playwright'],
};

export default nextConfig;
