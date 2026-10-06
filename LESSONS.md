# Lessons

## 2026-10-05 — Node 26
- better-sqlite3 11.x fails to compile against Node 26's V8 (no prebuild,
  source build errors). 13.x supports it. Bump native deps with the Node major.

## 2026-10-06 — TypeScript 7 breaks `next build`
- Renovate bumped `typescript` to 7.x (the native Go port: `bin/tsc` only plus
  per-platform `@typescript/typescript-*` binaries, no JS compiler API).
  Next.js 15's build-time type check `require`s the `typescript` API, so the
  Docker `npm run build` failed and the lab deploy broke. CI's `test` job
  only runs vitest, so the PR went green. Pinned back to `^5.8.3`; hold the
  TS 7 bump until Next supports it.
