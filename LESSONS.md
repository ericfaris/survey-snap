# Lessons

## 2026-10-05 — Node 26
- better-sqlite3 11.x fails to compile against Node 26's V8 (no prebuild,
  source build errors). 13.x supports it. Bump native deps with the Node major.

- **2026-10-06** — TypeScript 7 (native Go port) has no JS API; Next 15 silently fails to read tsconfig `paths`, so `@/` imports break in `next build` while vitest still passes. Pinned `typescript` to ^5 and added `npm run build` to CI so Renovate bumps that break the prod build fail before sentinel auto-merges them. Revisit when Next supports TS 7.
