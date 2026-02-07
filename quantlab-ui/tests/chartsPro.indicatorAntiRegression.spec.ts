/**
 * Anti-Regression Tests: Indicator Kind Parity
 * 
 * PURPOSE: Ensure that selecting an indicator like TEMA actually renders TEMA,
 * NOT a silent fallback to SMA.
 * 
 * ROOT CAUSE FIXED: drawings.ts had a hardcoded KNOWN_INDICATOR_KINDS array with
 * only 9 kinds. Any indicator not in that list (TEMA, DEMA, HMA, etc.) would
 * silently fall back to SMA. Now the manifest is the single source of truth.
 * 
 * These tests verify:
 * 1. Different indicator kinds produce different values
 * 2. dump().indicators shows correct kind property
 * 3. Adding TEMA vs SMA gives measurably different results
 * 
 * NOTE: Tests use TopBar indicator button (always visible) instead of RightPanel
 * button to ensure deterministic test execution regardless of panel state.
 */

import { test, expect } from "@playwright/test";
import { 
  INDICATORS_MODAL,
  openIndicatorsModal,
  addIndicatorViaModal,
  waitForIndicator,
  getDump 
} from "./selectors";
import { gotoChartsPro } from "./helpers";

test.describe("Indicator Anti-Regression", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
  });

  test("SMA(20) and TEMA(20) preserve their DISTINCT kinds in dump", async ({ page }) => {
    // Add SMA first
    await addIndicatorViaModal(page, "sma");
    await waitForIndicator(page, "sma");
    
    // Add TEMA
    await addIndicatorViaModal(page, "tema");
    await waitForIndicator(page, "tema");
    
    // Get dump and verify both exist with correct kinds
    const dump = await getDump(page);
    const indicators = dump?.indicators ?? [];
    
    // Assert both indicators exist with correct kinds
    const smaIndicator = indicators.find((i: any) => i.kind === "sma");
    const temaIndicator = indicators.find((i: any) => i.kind === "tema");
    
    expect(smaIndicator, "SMA indicator should exist in dump").toBeTruthy();
    expect(smaIndicator.kind, "SMA should have kind='sma'").toBe("sma");
    
    expect(temaIndicator, "TEMA indicator should exist in dump").toBeTruthy();
    expect(temaIndicator.kind, "TEMA should have kind='tema', NOT 'sma'").toBe("tema");
    
    // Verify they have computed lines (regression: before fix, TEMA would silently use SMA algo)
    expect(smaIndicator.lines?.length, "SMA should have computed lines").toBeGreaterThan(0);
    expect(temaIndicator.lines?.length, "TEMA should have computed lines").toBeGreaterThan(0);
    
    // NUMERIC GUARD: Get last value from lines[0].values[-1].value for each indicator
    // SMA and TEMA with same period MUST produce different values (TEMA is more responsive)
    const smaValues = smaIndicator.lines?.[0]?.values ?? [];
    const temaValues = temaIndicator.lines?.[0]?.values ?? [];
    
    expect(smaValues.length, "SMA should have computed values").toBeGreaterThan(0);
    expect(temaValues.length, "TEMA should have computed values").toBeGreaterThan(0);
    
    const smaLast = smaValues[smaValues.length - 1]?.value;
    const temaLast = temaValues[temaValues.length - 1]?.value;
    
    expect(smaLast, "SMA last value should be a number").not.toBeNull();
    expect(temaLast, "TEMA last value should be a number").not.toBeNull();
    
    // CRITICAL: SMA and TEMA must produce DIFFERENT numeric values
    // If they're equal, TEMA is using SMA's algorithm (the regression we fixed)
    const valueDiff = Math.abs((smaLast ?? 0) - (temaLast ?? 0));
    expect(
      valueDiff > 1e-6,
      `SMA(${smaLast?.toFixed(4)}) and TEMA(${temaLast?.toFixed(4)}) must produce different values. ` +
      `Diff=${valueDiff.toFixed(10)}. If equal, TEMA is silently falling back to SMA!`
    ).toBe(true);
    
    // Log for debugging
    console.log(`SMA kind: ${smaIndicator.kind}, last value: ${smaLast?.toFixed(4)}`);
    console.log(`TEMA kind: ${temaIndicator.kind}, last value: ${temaLast?.toFixed(4)}`);
    console.log(`Value difference: ${valueDiff.toFixed(6)}`);
  });

  test("DEMA and HMA preserve their DISTINCT kinds from SMA", async ({ page }) => {
    // Add all three
    await addIndicatorViaModal(page, "sma");
    await waitForIndicator(page, "sma");
    
    await addIndicatorViaModal(page, "dema");
    await waitForIndicator(page, "dema");
    
    await addIndicatorViaModal(page, "hma");
    await waitForIndicator(page, "hma");
    
    // Get dump and verify each has correct kind
    const dump = await getDump(page);
    const indicators = dump?.indicators ?? [];
    
    const smaIndicator = indicators.find((i: any) => i.kind === "sma");
    const demaIndicator = indicators.find((i: any) => i.kind === "dema");
    const hmaIndicator = indicators.find((i: any) => i.kind === "hma");
    
    expect(smaIndicator, "SMA should exist").toBeTruthy();
    expect(demaIndicator, "DEMA should exist with kind='dema', NOT 'sma'").toBeTruthy();
    expect(hmaIndicator, "HMA should exist with kind='hma', NOT 'sma'").toBeTruthy();
    
    // All should have computed lines
    expect(smaIndicator.lines?.length, "SMA should have lines").toBeGreaterThan(0);
    expect(demaIndicator.lines?.length, "DEMA should have lines").toBeGreaterThan(0);
    expect(hmaIndicator.lines?.length, "HMA should have lines").toBeGreaterThan(0);
    
    // Log for debugging
    console.log(`SMA kind: ${smaIndicator.kind}`);
    console.log(`DEMA kind: ${demaIndicator.kind}`);
    console.log(`HMA kind: ${hmaIndicator.kind}`);
  });

  test("All MA types preserve their kind in dump", async ({ page }) => {
    const maTypes = ["sma", "ema", "smma", "wma", "dema", "tema", "hma"];
    
    for (const kind of maTypes) {
      await addIndicatorViaModal(page, kind);
      await waitForIndicator(page, kind);
    }
    
    const dump = await getDump(page);
    const indicators = dump?.indicators ?? [];
    
    // Verify each MA type exists with correct kind
    for (const expectedKind of maTypes) {
      const found = indicators.find((i: any) => i.kind === expectedKind);
      expect(
        found,
        `Indicator with kind="${expectedKind}" should exist in dump. ` +
        `Found kinds: ${indicators.map((i: any) => i.kind).join(", ")}`
      ).toBeTruthy();
    }
  });

  test("Momentum indicators (RSI, MACD, Stoch) preserve their kind", async ({ page }) => {
    const momentumTypes = ["rsi", "macd", "stoch"];
    
    for (const kind of momentumTypes) {
      await addIndicatorViaModal(page, kind);
      await waitForIndicator(page, kind);
    }
    
    const dump = await getDump(page);
    const indicators = dump?.indicators ?? [];
    
    for (const expectedKind of momentumTypes) {
      const found = indicators.find((i: any) => i.kind === expectedKind);
      expect(
        found,
        `${expectedKind.toUpperCase()} should have kind="${expectedKind}", not fallback to SMA`
      ).toBeTruthy();
    }
  });

  test("Invalid indicator kind via set() does NOT silently become SMA", async ({ page }) => {
    // First verify no indicators exist
    let dump = await getDump(page);
    const initialCount = dump?.indicators?.length ?? 0;
    
    // Try to inject an invalid indicator directly via set()
    await page.evaluate(() => {
      (window as any).__lwcharts?.set?.({
        indicators: [{ id: "test-invalid", kind: "invalid_kind_xyz", inputs: {} }]
      });
    });
    
    // Use deterministic polling instead of waitForTimeout
    // Poll until dump() reflects any changes (or timeout after short period)
    await expect.poll(async () => {
      const d = await getDump(page);
      // Return indicators array - we just want to wait for state to settle
      return d?.indicators ?? [];
    }, { timeout: 2000, intervals: [100, 200, 500] }).toBeDefined();
    
    // Get dump again
    dump = await getDump(page);
    const indicators = dump?.indicators ?? [];
    
    // The invalid indicator should either:
    // 1. Not exist at all (ignored)
    // 2. Exist with kind="invalid_kind_xyz" (not silently converted to "sma")
    
    const smaFallback = indicators.find(
      (i: any) => i.id === "test-invalid" && i.kind === "sma"
    );
    
    expect(
      smaFallback,
      `Invalid indicator kind should NOT silently fall back to SMA. ` +
      `Found indicators: ${indicators.map((i: any) => `${i.id}:${i.kind}`).join(", ")}`
    ).toBeFalsy();
    
    // Log actual state
    console.log(`Initial count: ${initialCount}`);
    console.log(`After set() count: ${indicators.length}`);
    console.log(`Indicators: ${JSON.stringify(indicators.map((i: any) => ({ id: i.id, kind: i.kind })))}`);
  });

  test("Volume indicators (PVT, Klinger) preserve their kind", async ({ page }) => {
    const volumeTypes = ["pvt", "klinger"];
    
    for (const kind of volumeTypes) {
      await addIndicatorViaModal(page, kind);
      await waitForIndicator(page, kind);
    }
    
    const dump = await getDump(page);
    const indicators = dump?.indicators ?? [];
    
    for (const expectedKind of volumeTypes) {
      const found = indicators.find((i: any) => i.kind === expectedKind);
      expect(
        found,
        `${expectedKind.toUpperCase()} should have kind="${expectedKind}", not fallback to SMA`
      ).toBeTruthy();
      expect(
        found.lines?.length,
        `${expectedKind.toUpperCase()} should have computed lines`
      ).toBeGreaterThan(0);
    }
  });
});
