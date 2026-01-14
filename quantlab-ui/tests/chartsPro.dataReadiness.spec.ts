/**
 * chartsPro.dataReadiness.spec.ts
 *
 * Sprint TV-3 Steg 1B: Data readiness contract validation
 *
 * Tests that dump().data always exposes:
 * - api: { online: boolean, lastHealthCheck: number | null }
 * - status: 'idle' | 'loading' | 'ready' | 'error'
 * - lastError: string | null
 * - baseReady: boolean (true when rows > 0)
 * - comparesReady: boolean (true when all ready/error or none exist)
 * - compareStatusBySymbol: Record<symbol, { status, lastError, rows }>
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5173';

test.describe('ChartsPro Data Readiness (TV-3 Steg 1B)', () => {
  test.beforeEach(async ({ page }) => {
    // Load with mock=1 to test without backend dependency
    await page.goto(`${BASE_URL}/?mock=1`);
    await page.waitForTimeout(2000);
  });

  test('dump().data contract exists with all required fields', async ({ page }) => {
    const result = await page.evaluate(() => {
      const dumpFn = (window as any).__lwcharts?.dump;
      if (typeof dumpFn !== 'function') return { ok: false };
      
      const dump = dumpFn();
      const data = dump?.data;
      
      return {
        ok: !!data,
        hasApi: !!data?.api,
        hasStatus: 'status' in (data || {}),
        hasLastError: 'lastError' in (data || {}),
        hasBaseReady: 'baseReady' in (data || {}),
        hasComparesReady: 'comparesReady' in (data || {}),
        hasCompareStatusBySymbol: 'compareStatusBySymbol' in (data || {}),
        data,
      };
    });

    expect(result.ok).toBe(true);
    expect(result.hasApi).toBe(true);
    expect(result.hasStatus).toBe(true);
    expect(result.hasLastError).toBe(true);
    expect(result.hasBaseReady).toBe(true);
    expect(result.hasComparesReady).toBe(true);
    expect(result.hasCompareStatusBySymbol).toBe(true);
  });

  test('api object has online (boolean) and lastHealthCheck (number | null)', async ({ page }) => {
    const api = await page.evaluate(() => {
      const data = (window as any).__lwcharts?.dump?.()?.data;
      return {
        online: data?.api?.online,
        lastHealthCheck: data?.api?.lastHealthCheck,
        onlineType: typeof data?.api?.online,
        lastHealthCheckType: typeof data?.api?.lastHealthCheck,
      };
    });

    expect(typeof api.online).toBe('boolean');
    expect(api.lastHealthCheckType === 'number' || api.lastHealthCheckType === 'object').toBe(true); // object for null
  });

  test('status is one of idle|loading|ready|error', async ({ page }) => {
    const status = await page.evaluate(() => {
      return (window as any).__lwcharts?.dump?.()?.data?.status;
    });

    expect(['idle', 'loading', 'ready', 'error']).toContain(status);
  });

  test('baseReady is boolean and reflects pricePoints > 0', async ({ page }) => {
    const result = await page.evaluate(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return {
        baseReady: dump?.data?.baseReady,
        pricePoints: dump?.pricePoints,
      };
    });

    expect(typeof result.baseReady).toBe('boolean');
    
    // If baseReady is true, should have points
    if (result.baseReady) {
      expect(result.pricePoints).toBeGreaterThan(0);
    } else if (result.pricePoints === 0) {
      expect(result.baseReady).toBe(false);
    }
  });

  test('comparesReady is boolean and true when no compares or all ready/error', async ({ page }) => {
    const result = await page.evaluate(() => {
      const data = (window as any).__lwcharts?.dump?.()?.data;
      const compareCount = Object.keys(data?.compareStatusBySymbol || {}).length;
      const allReadyOrError = Object.values(data?.compareStatusBySymbol || {}).every(
        (s: any) => s?.status === 'ready' || s?.status === 'error'
      );
      
      return {
        comparesReady: data?.comparesReady,
        compareCount,
        allReadyOrError,
      };
    });

    expect(typeof result.comparesReady).toBe('boolean');
    
    // If no compares or all ready/error, should be true
    if (result.compareCount === 0 || result.allReadyOrError) {
      expect(result.comparesReady).toBe(true);
    }
  });

  test('compareStatusBySymbol is object with correct structure', async ({ page }) => {
    const result = await page.evaluate(() => {
      const data = (window as any).__lwcharts?.dump?.()?.data;
      const csBySymbol = data?.compareStatusBySymbol || {};
      
      return {
        isObject: typeof csBySymbol === 'object' && csBySymbol !== null,
        entries: Object.entries(csBySymbol).map(([symbol, status]: [string, any]) => ({
          symbol,
          hasStatus: 'status' in status,
          hasLastError: 'lastError' in status,
          hasRows: 'rows' in status,
          statusValue: status?.status,
          lastErrorValue: status?.lastError,
          rowsValue: status?.rows,
        })),
      };
    });

    expect(result.isObject).toBe(true);
    
    // Check each compare has correct structure
    result.entries.forEach(entry => {
      expect(entry.hasStatus).toBe(true);
      expect(entry.hasLastError).toBe(true);
      expect(entry.hasRows).toBe(true);
      expect(['idle', 'loading', 'ready', 'error']).toContain(entry.statusValue);
      expect(entry.lastErrorValue === null || typeof entry.lastErrorValue === 'string').toBe(true);
      expect(typeof entry.rowsValue).toBe('number');
    });
  });

  test('lastError is string | null', async ({ page }) => {
    const lastError = await page.evaluate(() => {
      return (window as any).__lwcharts?.dump?.()?.data?.lastError;
    });

    expect(lastError === null || typeof lastError === 'string').toBe(true);
  });

  test('all dump().data fields are never undefined', async ({ page }) => {
    const fields = await page.evaluate(() => {
      const data = (window as any).__lwcharts?.dump?.()?.data;
      return {
        api: data?.api,
        status: data?.status,
        lastError: data?.lastError,
        baseReady: data?.baseReady,
        comparesReady: data?.comparesReady,
        compareStatusBySymbol: data?.compareStatusBySymbol,
      };
    });

    // None should be undefined
    Object.values(fields).forEach(value => {
      expect(value).not.toBeUndefined();
    });
  });
});
