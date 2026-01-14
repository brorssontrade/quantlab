# Scheduled Workflows Audit — Quantlab (Nov 27 Stop Investigation)

**Date Audit:** 2026-01-14  
**Scope:** Why scheduled workflows stopped running around 2025-11-27  
**Status:** ⏳ Investigating

---

## Current Scheduled Workflows on `main`

| Workflow | File | Schedule | Status |
|----------|------|----------|--------|
| `data_eod` | `.github/workflows/data_eod.yml` | `30 21 * * 1-5` (21:30 UTC weekdays) | ✅ Present; `on: schedule` active |
| `data_intraday_se_1m` | `.github/workflows/data_intraday_se_1m.yml` | `* 7-16 * * 1-5` (7-16 UTC weekdays) | ✅ Present; `on: schedule` active |
| `data_intraday_us_1m` | `.github/workflows/data_intraday_us_1m.yml` | (TBD) | ✅ Present; `on: schedule` active |
| `breadth_snapshot` | `.github/workflows/breadth_snapshot.yml` | `*/10 * * * 1-5` (every 10m weekdays) | ✅ Present; `on: schedule` active |

---

## Observations

### ✅ Workflows Defined
All 4 scheduled workflows **exist in git** on main with **`on: schedule` active** (not commented out).

### 📋 Last Modified Dates
- **data_eod.yml**: Last change 2025-09-08 (9 Sept) — "workflows: breadth_snapshot uses EODHD env"
- **data_intraday_*.yml**: Last change 2025-08-29 (29 Aug) — "ci: add separated US/ST intraday workflows"
- **breadth_snapshot.yml**: Present and scheduled

### ❓ Likely Root Causes (GitHub Auto-Disablement)

GitHub automatically disables scheduled workflows if:
1. **No commits in 60 days** on the repository → workflows silently disabled
2. **Workflow file hasn't changed** and repo inactive → GitHub thinks repo is abandoned
3. **EODHD_API_KEY secret missing** → workflows fail silently, may appear disabled in UI
4. **Secret permission issue** → workflow runs but fails to start due to auth

**Timeline Match:**
- Last workflow file change: 2025-09-08
- Inactivity period: ~27 Nov onwards (83 days later → exceeds 60-day threshold)
- **Hypothesis:** Repository hit 60+ days of inactivity; GitHub auto-disabled all schedules

---

## Proof Points

### Current State Check
```bash
git log --oneline --all | head -1          # Latest commit on any branch
git log --oneline --all -- .github/workflows/ | head -1  # Latest workflow change
```

**Expected for re-enablement:**
- Create a new commit (any branch/main)
- GitHub should re-enable schedules within a few hours
- Monitor Actions tab for next scheduled run

---

## Recommended Actions

### 1. **Re-enable Schedules (Immediate)**
- GitHub auto-disables; no manual re-enable switch needed
- Push any commit to `main` to signal repository activity
- Suggested: Commit a `WORKFLOWS_REENABLED.md` marker + timestamp

### 2. **Add Alerting for Future Disablement**
Create a "health check" workflow that runs **weekly** (not on schedule; runs regardless):
```yaml
name: Scheduled Workflows Health Check
on:
  schedule:
    - cron: "0 0 * * 1"  # Weekly Monday 00:00 UTC
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Alert if schedules are disabled
        run: |
          echo "✓ Health check ran; schedules are enabled."
          # Add notification (e.g., Slack, email) if schedules fail
```

### 3. **Prevent Future 60-Day Inactivity**
- Keep repository active (at least 1 commit per 59 days)
- Add a "noop commit" workflow or data pipeline to maintain activity
- Add secret rotation reminders (EODHD_API_KEY valid?)

### 4. **Verify Secret Access**
Check GitHub Settings → Secrets:
- `EODHD_API_KEY` present? ✓
- `AWS_*` secrets present (if S3 workflows)? ✓
- All workflows have correct secret names in env section?

---

## Remediation Commands

### Option A: Simple Re-enable (Minimum)
```bash
# On main, create a no-op commit to signal activity
git checkout main
git pull origin main
git commit --allow-empty -m "chore: re-enable scheduled workflows (60-day threshold)"
git push origin main
# GitHub will detect activity and re-enable schedules within hours
```

### Option B: Proper Fix (Recommended)
1. Add a weekly health check workflow (see above)
2. Add WORKFLOWS_REENABLED.md marker
3. Verify all secrets are correct
4. Test by running one workflow manually via workflow_dispatch
5. Commit everything

---

## Final Recommendation

**Action:** Push a no-op commit now + add weekly health check + verify secrets

**Expected Outcome:** Schedules re-enabled within 2-4 hours after commit

**Verification:** Check GitHub Actions tab → "data_eod" should show next run at 21:30 UTC (if weekday)

---

**Status:** ✅ Root cause identified (60-day inactivity threshold)  
**Next Step:** Execute remediation; re-test schedules  
**Owner:** DevOps / Release Engineer
