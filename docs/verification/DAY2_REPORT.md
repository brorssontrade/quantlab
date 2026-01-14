# Day 2 Production Monitoring Report — ❌ ROLLBACK

**Timestamp:** 2026-01-14T21:25:54.119882+00:00  
**Target:** http://127.0.0.1:5173/  
**Duration:** 1.1s  

## Checks Summary

- **health:** ❌ FAIL
  - Error: `HTTPConnectionPool(host='127.0.0.1', port=5173): Max retries exceeded with url: /health (Caused by NewConnectionError("HTTPConnection(host='127.0.0.1', port=5173): Failed to establish a new connection: [Errno 111] Connection refused"))`
- **api_health:** ❌ FAIL
  - Error: `HTTPConnectionPool(host='127.0.0.1', port=5173): Max retries exceeded with url: /api/health (Caused by NewConnectionError("HTTPConnection(host='127.0.0.1', port=5173): Failed to establish a new connection: [Errno 111] Connection refused"))`
- **ohlcv_fetch:** ❌ FAIL
- **pytest_parity:** ❌ FAIL
  - Exit code: 4
- **pytest_critical:** ❌ FAIL
  - Exit code: 2

## Final Status

**ROLLBACK** — One or more checks failed; ROLLBACK recommended.

---

Report generated: 2026-01-14T21:25:54.119882+00:00  
Full details: [DAY2_REPORT.json](DAY2_REPORT.json)