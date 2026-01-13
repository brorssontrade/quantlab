# PR8 Monitoring Checklist — 48h Post-Deployment

**PR**: Indicators Consolidation (`consolidation-pr8`)  
**Deployment Date**: 2026-01-13  
**Monitoring Period**: Day 1 + Day 2 (48 hours)  
**Scope**: Verify zero regressions after merging PR8 to production

---

## Day 1 Monitoring (2026-01-13, After Deploy to Staging)

### Backend Health (5 min check)

- [ ] **API `/health` responds** without import errors
  - Command: `curl http://127.0.0.1:8000/health`
  - Expected: HTTP 200 with health status
  - Issue: Any ImportError about `engine.features` or `engine.indicator_adapters`

- [ ] **API `/api/health` responds**
  - Command: `curl http://127.0.0.1:8000/api/health`
  - Expected: HTTP 200 with API status
  - Issue: Any connection failures or timeouts

- [ ] **OHLCV fetch works** (1 symbol, 2 timeframes)
  - Command: `curl "http://127.0.0.1:8000/api/ohlcv?symbol=AAPL&timeframe=1d&limit=10"`
  - Expected: HTTP 200, valid OHLCV DataFrame JSON
  - Issue: Any adapter import errors, calculation failures, NaN-heavy outputs

- [ ] **Features pipeline** (add_common) returns expected columns
  - Command: `python -c "from engine.features import add_common; print(add_common.__doc__)"`
  - Expected: No ImportError, docstring prints successfully
  - Issue: Missing adapter imports, circular dependencies

### Frontend Verification (10 min check)

- [ ] **UI loads** (staging environment)
  - Command: Open http://127.0.0.1:5173 (or staging URL) in browser
  - Expected: Page loads, no console errors related to "engine", "features", or "adapter"
  - Issue: JavaScript errors, CSS failures, dark mode issues

- [ ] **Candles render** without errors
  - Action: Navigate to a chart tab, view candlestick data
  - Expected: Candles display correctly, no distortion
  - Issue: Chart freezing, data not loading, visual glitches

- [ ] **Zoom/Pan works**
  - Action: Mouse wheel zoom on chart, drag pan
  - Expected: Smooth zoom, panning follows mouse
  - Issue: Sluggish response, crashes, weird scaling

- [ ] **Compare feature works**
  - Action: Add 2+ symbols to compare, switch compare modes (price, percent, returns)
  - Expected: Compare panel updates correctly, no overlays glitch
  - Issue: Compare data not loading, mode switch fails

- [ ] **Legend + Chart Type Selector**
  - Action: Toggle legend visibility, switch chart type (candles → line → area)
  - Expected: Legend updates correctly, chart re-renders cleanly
  - Issue: Legend disappears unexpectedly, chart type switch fails

### Tests (Day 1, once)

- [ ] **Run parity tests**
  ```bash
  python -m pytest tests/test_indicators_parity.py -v --tb=line
  ```
  - Expected: 22/22 PASS (adapter functionality verified)
  - Issue: Any failures indicate adapter implementations broken

- [ ] **Run full pytest**
  ```bash
  python -m pytest -x
  ```
  - Expected: 28/28 PASS (baseline maintained)
  - Issue: New failures indicate regression in production code

- [ ] **Run npm build**
  ```bash
  cd quantlab-ui && npm run build
  ```
  - Expected: 0 TypeScript errors, build succeeds
  - Issue: TS errors, build warnings related to indicators

### Day 1 Sign-Off

**Date**: ________________  
**Time**: ________________  
**Status**: ☐ ALL PASS | ☐ FAILURES DETECTED | ☐ PARTIAL (requires triage)  
**Notes**: (List any issues found, severity, required actions)

```
[Monitoring lead to fill in]
```

---

## Day 2 Monitoring (2026-01-14, After Deploy to Production)

### Backend Health (5 min check)

- [ ] **Production `/health` responds** (repeat from Day 1)
  - Command: `curl https://api.quantlab.prod/health` (or production URL)
  - Expected: HTTP 200
  - Issue: Service unavailable, import errors

- [ ] **Production OHLCV fetch** (repeat for 2 different symbols)
  - Command: `curl "https://api.quantlab.prod/api/ohlcv?symbol=ABB.ST&timeframe=5m&limit=20"`
  - Expected: HTTP 200, valid data with all expected columns
  - Issue: Missing columns, invalid data, API errors

- [ ] **No deprecation warnings** in logs
  - Action: Check application logs for warnings about deprecated engine.features imports
  - Expected: Zero warnings related to `sma`, `ema`, `rsi`, `atr`, etc.
  - Issue: Any deprecation warnings indicate code still using old imports

- [ ] **Features pipeline performance** is acceptable
  - Command: Time add_common() on 100+ bars: `time python -c "from engine.features import add_common; df = ...; add_common(df)"`
  - Expected: < 100ms for 100 bars
  - Issue: Slower than expected indicates inefficient adapter implementations

### Frontend Verification (10 min check)

- [ ] **Production UI loads** without errors
  - Command: Open https://quantlab.prod (or production URL)
  - Expected: Full page load, no 500 errors, charts render
  - Issue: 500 errors, stuck on loading, CSS failures

- [ ] **Historical chart data** loads correctly
  - Action: Load a 1-year chart for a major index (e.g., SPX)
  - Expected: All candlesticks render, no missing data gaps
  - Issue: Data gaps, missing bars, rendering errors

- [ ] **Indicators overlay** (if UI includes indicators)
  - Action: Add moving averages or other indicators to chart
  - Expected: Indicator lines render correctly, values are reasonable
  - Issue: Indicator values look wrong, lines don't align with candles

- [ ] **Mobile responsiveness** (if applicable)
  - Action: View UI on mobile browser or resize window to mobile size
  - Expected: UI adapts correctly, no overlapping elements
  - Issue: Layout breaks, buttons unclickable, text unreadable

### Tests (Day 2, once)

- [ ] **Run smoke test** (fast check of critical paths)
  ```bash
  python -m pytest tests/test_indicators_parity.py::test_rsi_parity tests/test_indicators_parity.py::test_atr_parity tests/test_indicators_parity.py::test_add_common_rsi_columns -v
  ```
  - Expected: 3/3 PASS
  - Issue: Any failure indicates core adapter failures

- [ ] **Run add_common integration** (full feature pipeline)
  ```bash
  python -c "
  import pandas as pd
  from engine.features import add_common
  df = pd.read_csv('storage/tmp/test_ohlcv.csv')  # or equivalent
  result = add_common(df)
  print(f'Columns: {list(result.columns)}')
  print(f'Rows: {len(result)}')
  assert len(result) > 0
  "
  ```
  - Expected: Feature columns present, rows preserved
  - Issue: Missing columns, data loss, errors

### Day 2 Sign-Off

**Date**: ________________  
**Time**: ________________  
**Status**: ☐ ALL PASS | ☐ FAILURES DETECTED | ☐ PARTIAL (requires triage)  
**Deployment Approval**: ☐ APPROVED FOR KEEP | ☐ ROLLBACK REQUIRED  
**Notes**: (Final assessment, any outstanding issues, recommendations)

```
[Monitoring lead + Deployment manager to fill in]
```

---

## Critical Issues & Rollback Criteria

### STOP & ROLLBACK IF:

1. **Import Errors**: Any `ImportError` related to `engine.features`, `engine.indicator_adapters`, or deprecated indicator functions
2. **API 500 Errors**: Persistent 500 errors on `/health` or `/api/ohlcv` endpoints
3. **Data Corruption**: Missing or invalid OHLCV columns, NaN-heavy outputs in features
4. **Test Failures**: Any test_indicators_parity failure indicates adapter implementation broken
5. **Performance Degradation**: add_common() slower than baseline (> 200ms for 100 bars)
6. **UI Crashes**: Frontend console errors related to data loading or chart rendering

### Triage Path (if issues found):

1. **Document**: Add exact error message, reproduction steps, timestamp
2. **Assess**: Is it adapter-related (PR8) or pre-existing issue?
3. **Isolate**: Can it be fixed with adapter code change, or does it require rollback?
4. **Fix or Rollback**:
   - If fixable: Apply hotfix to production (fast iteration)
   - If not fixable: Rollback to previous stable tag (should be ~1 min)

---

## Success Criteria (48h Monitoring Complete)

✅ **Day 1 AND Day 2**:
- All backend health checks pass
- All frontend verification checks pass
- All tests pass (parity + integration)
- Zero deprecation warnings in logs
- Performance within acceptable bounds

✅ **No rollbacks or hotfixes required**

✅ **All sign-off fields completed by authorized personnel**

**If all above satisfied**: PR8 is STABLE. Proceed to close release window, document lessons learned, and plan next PR.

---

## References

- PR8_FINAL.md — Comprehensive PR8 specification & gate documentation
- consolidation-pr8 tag — Exact code state that was deployed
- LLM.md — PR4-PR8 migration timeline and decisions
