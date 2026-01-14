# PR8 Final — Locked on main (post PR8.1)

**Merge commit:** da216a4 (PR8.1: Repo Hygiene Hotfix — restore quantlab-ui sources for reproducible gates)
**Tag (to create):** consolidation-pr8.1
**Status:** LOCKED — all four binary gates green on main after PR8.1

## Gate Results (main)
- Gate 1 (Pytest): 28/28 PASS (baseline unchanged from PR8)
- Gate 2 (npm build): PASS — `npm run build` (vite 7.3.1) → "✓ 2464 modules transformed"; built in ~6.2s; 0 TypeScript errors (chunk-size warning only)
- Gate 3 (Playwright offlineOnline): PASS — `npx playwright test tests/chartsPro.offlineOnline.spec.ts --project=chromium --reporter=line` → 14/14 PASS
- Gate 4 (Parity): 22/22 PASS (unchanged from PR8)

## Repo Hygiene Summary
- quantlab-ui was partially absent on main; restored from history:
  - Base tree from `a75ee67f10289ea265c550112ca073087a441d6a`
  - CP4 overlay files from `7fba424e2f137c4569adf7fb99ca094997ec4b55`
- Stabilizations included:
  - Fallback `__lwcharts.dump()` wiring in `quantlab-ui/src/features/chartsPro/ChartsProTab.tsx` so QA globals are readable without backend
  - Test hardening in `quantlab-ui/tests/chartsPro.offlineOnline.spec.ts` (force Charts tab, deterministic dump stub)

## Evidence
- Gate 2 build log: npm run build PASS (0 TS errors)
- Gate 3 test log: offlineOnline 14/14 PASS
- Repo hygiene details: REPO_HYGIENE_REPORT.md

## Next Steps
- Create tag `consolidation-pr8.1` at merge commit da216a4 (do not move existing `consolidation-pr8`)
- Staging deploy + Day 1 monitoring may proceed per PR8_MONITORING_CHECKLIST.md
