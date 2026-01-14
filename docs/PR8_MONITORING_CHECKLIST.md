# PR8 Monitoring Checklist — Post-Deployment Verification

**Scope:** 48-hour post-deployment monitoring for PR8 consolidation (indicators + adapters).  
**Status:** Day 1 ✅ PASS | Day 2 ⏳ PENDING

---

## Day 1: Staging Verification (T+0 → T+24h)

**Target:** Staging environment  
**Executed:** 2026-01-14 (Day 1)  
**Status:** ✅ PASS

### Checks:
- ✅ Health endpoints: `/health` + `/api/health` → OK
- ✅ OHLCV fetch: Single-symbol daily + weekly → Data returned
- ✅ Pytest baseline: 28/28 PASS (parity tests included)
- ✅ Logs: No import errors, no deprecated warnings, no 500/timeout spikes
- ✅ Multi-symbol sanity: Base + compare mode functional

**Result:** No deviations; staging environment stable.

---

## Day 2: Production Verification (T+24h → T+48h)

**Target:** Production environment  
**Executed:** ⏳ PENDING (automated via GitHub Actions workflow)  
**Status:** ⏳ AWAITING EXECUTION

### Execution Plan:
Run via GitHub Actions workflow: `.github/workflows/day2-monitoring.yml`

**Automated checks (scripts/monitoring/day2_check.py):**
1. **Health endpoints:**
   - `GET /health` → Expected: 200 OK
   - `GET /api/health` → Expected: 200 OK + valid JSON

2. **Sample OHLCV fetch:**
   - Symbol: ABB.ST
   - Timeframes: daily, weekly
   - Expected: Non-empty data arrays, no errors

3. **Pytest smoke tests:**
   - Parity/adapters suite: `tests/test_indicators_parity.py` → Expected: All PASS
   - Critical path: `pytest tests/ -m "not slow"` → Expected: All PASS

4. **Logs validation:**
   - No import errors related to indicators/features/adapters
   - No deprecated warnings
   - No 500/timeout spikes in response bodies

### Artifacts Generated:
- `docs/verification/DAY2_REPORT.json` (machine-readable)
- `docs/verification/DAY2_REPORT.md` (human-readable summary)

### Exit Criteria:
- **APPROVED:** All checks PASS → PR8 complete; PR9 may proceed
- **ROLLBACK:** Any check FAIL → Revert to pre-PR8 state; investigate before retry

---

## Day 2 Summary (To be filled post-execution)

**Date/Time:** _TBD_  
**Overall Status:** _APPROVED / ROLLBACK_  

**Check Results:**
- Health: _PASS / FAIL_
- API Health: _PASS / FAIL_
- OHLCV Fetch: _PASS / FAIL_
- Pytest Parity: _PASS / FAIL_
- Pytest Critical: _PASS / FAIL_

**Deviations:** _None / [List any deviations]_  
**Recommended Action:** _Continue to PR9 / Rollback and investigate_

**Report Links:**
- [DAY2_REPORT.json](verification/DAY2_REPORT.json)
- [DAY2_REPORT.md](verification/DAY2_REPORT.md)

---

## Notes

- Day 1 completed manually; no issues observed.
- Day 2 automated via workflow_dispatch to ensure reproducibility and use of prod secrets.
- Logs checkpoint: Since direct prod shell access is not available, log validation is inferred from:
  - Health endpoint responses (no error messages)
  - Pytest outputs (no import failures)
  - OHLCV fetch success (no timeout/500 errors)
- Hard stop: PR9 must not begin until Day 2 = APPROVED.

---

**Last Updated:** 2026-01-14 (Day 1 complete; Day 2 pending)
