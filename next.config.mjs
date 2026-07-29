/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3, sharp and playwright are native/heavy — never bundle them.
  // linkedom is here for a different reason: its optional `canvas` dependency
  // is guarded by a try/require/catch fallback that webpack's static analysis
  // breaks when bundled (the catch never fires, so createCanvas ends up
  // undefined instead of falling back to the no-op shim) — verified live
  // against mcdvoice.com pages containing a <canvas> element. Plain Node
  // require (tests, scripts) is unaffected; only Next's server bundling was.
  serverExternalPackages: ['better-sqlite3', 'sharp', 'playwright', 'linkedom'],
};

export default nextConfig;
