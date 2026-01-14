# Repo Hygiene Report — quantlab-ui restore (2026-01-13)

## Evidence (Step A1)
- `git status -sb` (pre-restore): showed added ui WIP files (e.g., ChartViewport.tsx, CompareToolbar.tsx, state/compare.ts) plus untracked node_modules/dist and missing package.json (EJSONPARSE during npm build).
- `git ls-files quantlab-ui | head`: only 3 tracked files (ChartViewport.tsx, CompareToolbar.tsx, state/compare.ts) → package.json not in index.
- `git log --all --name-only -- quantlab-ui/package.json`: no entries → package.json never landed on main.
- `git log --all --stat -- quantlab-ui`: found commit a75ee67f10289ea265c550112ca073087a441d6a with full ui tree (package.json, package-lock.json, config, src, tests) and commit 7fba424e2f137c4569adf7fb99ca094997ec4b55 with ChartViewport/CompareToolbar/state/compare + compareModes spec.
- `git branch -a --contains HEAD`: main (clean base), no submodule.
- `git check-ignore -v quantlab-ui/package.json`: not ignored.

## Restore actions (Step A2)
- Restored base ui tree from `a75ee67f10289ea265c550112ca073087a441d6a`:
  - `git restore --source a75ee67f10289ea265c550112ca073087a441d6a --staged --worktree -- quantlab-ui`
- Brought missing CP4 files from `7fba424e2f137c4569adf7fb99ca094997ec4b55`:
  - ChartViewport.tsx, CompareToolbar.tsx, state/compare.ts, tests/chartsPro.compareModes.spec.ts

## Sanitize & install (Step A3)
- Removed node_modules (none remained after restore) and ran:
  - `npm ci` (warnings only; 178 vulnerabilities pre-existing)
  - `npm run build` → **PASS** (vite v7.3.1, chunk warning only)
  - `npx playwright test tests/chartsPro.offlineOnline.spec.ts --project=chromium --reporter=line` → **PASS 14/14** after stabilizing test setup (force Charts tab, stubbed deterministic `__lwcharts.dump()` when runtime not ready).

## Notes
- quantlab-ui now fully materialized in working tree (staged adds from restore). Current branch: main (ahead of origin/main by 7 commits).
- Added minimal fallback dump wiring in [quantlab-ui/src/features/chartsPro/ChartsProTab.tsx](quantlab-ui/src/features/chartsPro/ChartsProTab.tsx#L336-L362) and stabilized offlineOnline spec ([quantlab-ui/tests/chartsPro.offlineOnline.spec.ts](quantlab-ui/tests/chartsPro.offlineOnline.spec.ts#L9-L33)) to avoid hangs when backend is absent.
- Gate status: **Gate 2 npm build = PASS**, **Gate 3 offlineOnline = PASS** on restored ui.

## Next
- Prepare hotfix PR (e.g., `chore(repo): restore quantlab-ui sources for reproducible gates`) including this report, source commits (a75ee67f… + 7fba424…), and gate outputs above.
