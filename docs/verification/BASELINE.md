# PR8 Baseline (post PR8.1)

**Scope:** Verification baseline on main after PR8.1 (repo hygiene hotfix)

- Merge commit: da216a4 (PR8.1)
- Tag to create: consolidation-pr8.1
- Status: LOCKED

## Gate Summary
- Gate 1 — Pytest: 28/28 PASS (unchanged)
- Gate 2 — npm build: PASS (vite build, 0 TS errors)
- Gate 3 — Playwright offlineOnline: PASS (14/14)
- Gate 4 — Parity: 22/22 PASS

## Evidence
- REPO_HYGIENE_REPORT.md (restore sources, commands, logs)
- Gate 2 log: npm run build → "✓ 2464 modules transformed"; built ~6.2s; 0 TS errors
- Gate 3 log: offlineOnline suite 14/14 PASS (chromium)

## Notes
- quantlab-ui fully materialized from historical commits (a75ee67f base + 7fba424e overlay)
- QA fallback: __lwcharts.dump() stub + Charts tab activation ensure deterministic offlineOnline
