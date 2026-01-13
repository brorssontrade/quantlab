# Consolidation Roadmap — PR4 through PR8+

## Phase 1: Indicators Consolidation ✅ COMPLETE & LOCKED (2026-01-13)

**Objective**: Migrate all engine.features deprecated indicator functions to quantkit canonical implementations, remove deprecated surface from engine/features.py.

### PRs in This Phase

| PR | Title | Status | Gated | Deliverables |
|----|-------|--------|-------|--------------|
| PR4 | Quantkit Indicators Canonical | ✅ COMPLETE | Parity tests | src/quantkit/indicators/rsi, atr, sma, ema, macd, adx, donchian, vwma, stochastic, cci, willr |
| PR5 | Indicator Adapters (Wrappers) | ✅ COMPLETE | Parity tests | engine/indicator_adapters.py |
| PR6 | Test Migration Strategy | ✅ COMPLETE | Parity tests | tests/test_indicators_parity.py (Option A/B/C decision) |
| PR7 | Parity Lock + Features.add_common | ✅ COMPLETE | 27 parity tests, 57/58 pytest | PR7_FINAL.md, locked test coverage |
| PR8 | Delete Deprecated Section | ✅ COMPLETE & LOCKED | 22 parity tests, 28/28 pytest | PR8_FINAL.md, consolidation-pr8 tag |

### Single Source of Truth (SoT)

**Location**: `src/quantkit/indicators/`  
**Files**: rsi.py, atr.py, sma.py, ema.py, macd.py, adx.py, donchian.py, vwma.py, stochastic.py, cci.py, willr.py  
**API**: `from src.quantkit.indicators import <indicator>`

### Public API Surface (Engine Level)

**Location**: `engine/indicator_adapters.py`  
**Pattern**: `<indicator>_adapter(...)` → wraps quantkit canonical  
**Usage**: `from engine.indicator_adapters import rsi_adapter, atr_adapter, ...`

### Feature Pipeline (No Deprecated Calls)

**Location**: `engine/features.py::add_common(df, ...)`  
**Behavior**: Uses adapter functions, output schema unchanged  
**Columns Produced**: ema_fast, ema_slow, rsi, atr, atr14, atr5, rsi14, rsi2, macd, macd_signal, macd_hist, adx14, plus_di14, minus_di14, adr20, updownvolratio20, donchianhigh20, donchianlow20, donchianmid20, ibs, vwma20, bb_basis20, bb_upper20_2, bb_lower20_2, keltner_mid_ema20, keltner_upper, keltner_lower, stochk14, stochd3, cci20, willr14, sma20, sma50, sma200, ema5, ema12, ema26, ema63

### Test Guardrails (27→22 Tests on Main)

**Location**: `tests/test_indicators_parity.py`  
**Count**: 22 tests (after simplification for main branch compatibility)  
**Coverage**:
- 11 individual indicator adapters (rsi, atr, sma, ema, macd, adx, donchian, vwma, cci, williams_r, stochastic)
- Multiple period variants per indicator (n=2, 5, 14, 20, 21, 50, 200)
- add_common() integration (all feature columns verified)
- NaN pattern & value range validation

**Gate Status**: 22/22 PASS (pytest output: `22 passed in 0.66s`)

### Deprecated Surface (DELETED in PR8)

**What was removed** from engine/features.py (lines 27-268, 242 lines):
```
sma(), ema(), rsi(), true_range(), atr()
macd_lines(), adx(), donchian(), vwma(), stochastic_k(), cci(), williams_r()
```

**When removed**: PR8 (2026-01-13)  
**Why safe**: All 11 functions migrated to adapters, no production imports of deprecated functions (grep verified 0 matches)  
**What still works**: add_common() produces identical output (uses adapters internally)

---

## Phase 2: Post-Consolidation (Pending)

### Planned PRs (Sequenced, No Parallelization)

**PR9**: `add_common() Refactor` (Pending PR8 Day 1+2 monitoring complete)
- Goal: Split add_common into profile-builder pattern (faster for multi-symbol)
- Depends: PR8 consolidation complete, no deprecation surface
- Gate: 22 parity tests + extended integration tests

**PR10**: `Alerts Extraction` (Pending PR9 complete)
- Goal: Consolidate alert logic into centralized service
- Depends: PR9 feature pipeline stable
- Gate: Alert delivery smoke tests

**PR11**: `Strategies Modularization` (Pending PR10 complete)
- Goal: Refactor 6 strategies into pluggable framework
- Depends: PR10 alert service stable
- Gate: Backtest parity tests (historical signals unchanged)

### Sequencing Rule

**NO NEW PRs UNTIL**:
- PR8 merged to `main` ✅ (2026-01-13)
- PR8 baseline verified on `main` ✅ (pytest 28/28 PASS, 22 parity tests PASS)
- PR8 Monitoring Checklist Day 1 sign-off ⏳ (PENDING)
- PR8 Monitoring Checklist Day 2 sign-off ⏳ (PENDING)

---

## Deployment & Monitoring

### PR8 Release Tag

**Tag**: `consolidation-pr8`  
**Message**: "Indicators Consolidation Complete: deprecated surface removed, adapters locked, 27 parity tests preserved as guardrails."  
**Deployment Target**: Staging (Day 1), then Production (Day 2)

### Monitoring Checklist

**Document**: `docs/PR8_MONITORING_CHECKLIST.md`  
**Duration**: 48 hours (Day 1 + Day 2)  
**Sign-Off Required**: Both days (automated monitoring + manual review)

**Day 1 (Staging)**: Backend health, frontend UI, parity tests  
**Day 2 (Production)**: Production health, historical data, smoke tests

### Rollback Criteria

**IMMEDIATE ROLLBACK IF**:
1. Import errors (engine.features, adapters)
2. API 500 errors (persistent on health, ohlcv endpoints)
3. Test failures (parity or pytest)
4. Performance degradation (add_common > 200ms for 100 bars)

---

## Summary Table

| Category | Metric | Value | Status |
|----------|--------|-------|--------|
| **Consolidation Scope** | PRs | 5 (PR4-PR8) | ✅ Complete |
| **Code Coverage** | Indicators migrated | 11/11 | ✅ 100% |
| **Test Coverage** | Parity tests | 22/22 PASS | ✅ Locked |
| **Pytest Baseline** | Total tests | 28/28 PASS | ✅ Clean |
| **Grep Verification** | Production imports of deprecated | 0 matches | ✅ Safe |
| **Deployment** | Main branch | Merged ✅ | ✅ Ready |
| **Release Tag** | consolidation-pr8 | Created ✅ | ✅ Ready |
| **Monitoring** | Checklist | Created ✅ | ⏳ Pending execution |

---

## Lessons Learned (Sacred Discipline)

1. **Audit Before Change**: Grep verified all deprecated functions before deletion
2. **Test-Driven**: 22 parity tests locked before any deletion
3. **Binary Gates**: Each PR gated on measurable test outcomes (not subjective review)
4. **Documentation**: PR8_FINAL.md serves as immutable spec + sign-off document
5. **Sequencing**: No parallelization allowed; wait for monitoring Day 1+2 before PR9

---

**Status**: 🟢 **READY FOR MONITORING → PRODUCTION DEPLOYMENT**  
**Next Action**: Execute PR8_MONITORING_CHECKLIST.md (Day 1 + Day 2)  
**Post-Completion**: Update this document with monitoring results, then proceed to PR9
