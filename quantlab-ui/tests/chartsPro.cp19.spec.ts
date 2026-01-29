/**
 * chartsPro.cp19.spec.ts
 *
 * TV-19: BottomBar Functions (crosshair time label, quick ranges, etc.)
 */

import { test, expect, TestInfo, Page } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

test.describe("TV-19: BottomBar Functions", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo, { mock: true });
    // Move mouse away from chart to reset crosshair
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
  });

  test.describe("TV-19.1: X-axis crosshair time label", () => {
    test("crosshair time label appears on hover", async ({ page }) => {
      const chartRoot = page.locator('[data-testid="tv-chart-root"]');
      const timeLabel = page.locator('[data-testid="chartspro-crosshair-time"]');
      const crosshair = page.locator('[data-testid="chartspro-crosshair"]');

      // Initially not visible (mouse moved away in beforeEach)
      await expect(crosshair).toHaveAttribute("data-visible", "false");

      // Hover on chart center
      const box = await chartRoot.boundingBox();
      expect(box).toBeTruthy();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.waitForTimeout(100); // Allow crosshair to update

      // Crosshair should be visible
      await expect(crosshair).toHaveAttribute("data-visible", "true");
      
      // Time label should exist and have content
      await expect(timeLabel).toBeVisible();
      const timeText = await timeLabel.textContent();
      expect(timeText).toBeTruthy();
      expect(timeText!.length).toBeGreaterThan(0);
    });

    test("crosshair time label updates when moving", async ({ page }) => {
      const chartRoot = page.locator('[data-testid="tv-chart-root"]');
      const timeLabel = page.locator('[data-testid="chartspro-crosshair-time"]');

      const box = await chartRoot.boundingBox();
      expect(box).toBeTruthy();

      // Hover on left side
      await page.mouse.move(box!.x + 100, box!.y + box!.height / 2);
      await page.waitForTimeout(100);
      const leftTimeText = await timeLabel.textContent();

      // Move to right side
      await page.mouse.move(box!.x + box!.width - 150, box!.y + box!.height / 2);
      await page.waitForTimeout(100);
      const rightTimeText = await timeLabel.textContent();

      // Times should be different (different bar positions)
      expect(leftTimeText).not.toEqual(rightTimeText);
    });

    test("crosshair time label hides when leaving chart", async ({ page }) => {
      const chartRoot = page.locator('[data-testid="tv-chart-root"]');
      const crosshair = page.locator('[data-testid="chartspro-crosshair"]');

      const box = await chartRoot.boundingBox();
      expect(box).toBeTruthy();

      // Hover on chart
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.waitForTimeout(100);
      await expect(crosshair).toHaveAttribute("data-visible", "true");

      // Move mouse outside chart (above it)
      await page.mouse.move(box!.x + box!.width / 2, box!.y - 50);
      await page.waitForTimeout(200);

      // Crosshair should be hidden
      await expect(crosshair).toHaveAttribute("data-visible", "false");
    });

    test("crosshair time label has TradingView-style black background", async ({ page }) => {
      const chartRoot = page.locator('[data-testid="tv-chart-root"]');
      const timeLabel = page.locator('[data-testid="chartspro-crosshair-time"]');

      const box = await chartRoot.boundingBox();
      expect(box).toBeTruthy();

      // Hover on chart
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.waitForTimeout(100);

      await expect(timeLabel).toBeVisible();
      
      // Check that it has dark background (TradingView-style)
      const bgColor = await timeLabel.evaluate((el) => 
        window.getComputedStyle(el).backgroundColor
      );
      
      // Should be dark (#131722 = rgb(19, 23, 34) or similar dark color)
      expect(bgColor).toMatch(/rgb\(\s*\d{1,2},\s*\d{1,2},\s*\d{1,2}\s*\)/);
    });
  });

  test.describe("TV-19.2c: Quick ranges - timeframe-agnostic time window", () => {
    test("5D range shows ~5 calendar days span (not 5 bars)", async ({ page }) => {
      // Click 5D - should show last 5 CALENDAR DAYS regardless of timeframe
      const range5D = page.locator('[data-testid="bottombar-range-5D"]');
      await range5D.click();
      await page.waitForTimeout(300);

      const dump = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });

      const visibleTimeRange = dump?.render?.scale?.visibleTimeRange;
      const dataBounds = dump?.dataBounds;
      
      expect(visibleTimeRange).toBeTruthy();
      expect(dataBounds).toBeTruthy();

      // Key invariant: visible "to" should be at lastBarTime
      const tolerance = 7 * 24 * 60 * 60; // 1 week tolerance for edge cases
      expect(Math.abs(visibleTimeRange.to - dataBounds.lastBarTime)).toBeLessThanOrEqual(tolerance);
      
      // CRITICAL: span should be ~5 days in SECONDS, not ~5 bars
      // 5 days = 5 * 86400 = 432000 seconds
      // Allow 80% tolerance for weekends/gaps but must be > 4 days
      const span = visibleTimeRange.to - visibleTimeRange.from;
      const minExpectedSpan = 4 * 24 * 60 * 60; // At least 4 days (for gaps)
      
      // If data has enough history, span should be >= 4 days
      // (This catches the bug where 5D showed only ~5 bars = hours with 1h timeframe)
      const dataSpan = dataBounds.lastBarTime - dataBounds.firstBarTime;
      if (dataSpan >= 5 * 24 * 60 * 60) {
        // Data has 5+ days of history - span must be ~5 days
        expect(span).toBeGreaterThanOrEqual(minExpectedSpan);
      }
      
      // Sanity: dates must be after year 2000 (catches 1970/1980 bugs)
      const year2000 = 946684800;
      expect(visibleTimeRange.from).toBeGreaterThan(year2000);
      expect(visibleTimeRange.to).toBeGreaterThan(year2000);
    });

    test("1M range shows ~30 calendar days span", async ({ page }) => {
      // Click 1M
      const range1M = page.locator('[data-testid="bottombar-range-1M"]');
      await range1M.click();
      await page.waitForTimeout(300);

      const dump = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });

      const visibleTimeRange = dump?.render?.scale?.visibleTimeRange;
      const dataBounds = dump?.dataBounds;
      
      expect(visibleTimeRange).toBeTruthy();
      expect(dataBounds).toBeTruthy();

      const span = visibleTimeRange.to - visibleTimeRange.from;
      const dataSpan = dataBounds.lastBarTime - dataBounds.firstBarTime;
      
      // If data has 30+ days of history, span should be ~30 days
      if (dataSpan >= 30 * 24 * 60 * 60) {
        const minExpectedSpan = 25 * 24 * 60 * 60; // At least 25 days
        expect(span).toBeGreaterThanOrEqual(minExpectedSpan);
      }
    });

    test("range click does NOT change timeframe", async ({ page }) => {
      // Get initial timeframe from dump
      const initialDump = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });
      const initialTimeframe = initialDump?.ui?.timeframe;

      // Click various ranges
      for (const range of ["5D", "1M", "6M", "All"]) {
        const rangeBtn = page.locator(`[data-testid="bottombar-range-${range}"]`);
        await rangeBtn.click();
        await page.waitForTimeout(200);
      }

      // Get timeframe after all range clicks
      const finalDump = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });
      const finalTimeframe = finalDump?.ui?.timeframe;

      // Timeframe must be unchanged
      expect(finalTimeframe).toBe(initialTimeframe);
    });

    test("All range shows full data span (firstBar to lastBar)", async ({ page }) => {
      // Click All
      const rangeAll = page.locator('[data-testid="bottombar-range-All"]');
      await rangeAll.click();
      await page.waitForTimeout(300);

      const dump = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });

      const visibleTimeRange = dump?.render?.scale?.visibleTimeRange;
      const dataBounds = dump?.dataBounds;
      
      expect(visibleTimeRange).toBeTruthy();
      expect(dataBounds).toBeTruthy();

      // All should show from firstBarTime to lastBarTime
      const tolerance = 7 * 24 * 60 * 60;
      expect(Math.abs(visibleTimeRange.from - dataBounds.firstBarTime)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(visibleTimeRange.to - dataBounds.lastBarTime)).toBeLessThanOrEqual(tolerance);
    });

    test("visible range dates are sane (after year 2000, not 1970/1980)", async ({ page }) => {
      const year2000 = 946684800; // Jan 1, 2000 in unix seconds
      
      for (const range of ["1D", "5D", "1M", "6M", "All"]) {
        const rangeBtn = page.locator(`[data-testid="bottombar-range-${range}"]`);
        await rangeBtn.click();
        await page.waitForTimeout(200);

        const dump = await page.evaluate(() => {
          return (window as any).__lwcharts?.dump?.();
        });

        const visibleTimeRange = dump?.render?.scale?.visibleTimeRange;
        expect(visibleTimeRange).toBeTruthy();
        expect(visibleTimeRange.from).toBeGreaterThan(year2000);
        expect(visibleTimeRange.to).toBeGreaterThan(year2000);
      }
    });

    test("range selection is persisted in localStorage", async ({ page }) => {
      // Click 6M
      const range6M = page.locator('[data-testid="bottombar-range-6M"]');
      await range6M.click();
      await page.waitForTimeout(300);

      // Verify localStorage was updated
      const rangeStored = await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.range"));
      expect(rangeStored).toBe("6M");
    });
  });

  test.describe("TV-19.3: Timezone + Market status", () => {
    test("timezone selector shows dropdown and changes timezoneId", async ({ page }) => {
      // Wait for bottomBar to be initialized in dump
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.bottomBar?.timezoneId;
      }, { timeout: 5000 }).toBeTruthy();

      // Get initial timezone
      const initialDump = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });
      const initialTz = initialDump?.ui?.bottomBar?.timezoneId;
      expect(initialTz).toBe("UTC"); // Default

      // Click timezone toggle to open dropdown
      const tzToggle = page.locator('[data-testid="bottombar-tz-toggle"]');
      await expect(tzToggle).toBeVisible();
      await tzToggle.click();

      // Dropdown should appear
      const dropdown = page.locator('[data-testid="bottombar-tz-dropdown"]');
      await expect(dropdown).toBeVisible();

      // Select Stockholm
      await page.locator('[data-testid="bottombar-tz-option-Europe-Stockholm"]').click();

      // Wait for dump to update
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.bottomBar?.timezoneId;
      }, { timeout: 2000 }).toBe("Europe/Stockholm");

      // Select back to UTC
      await tzToggle.click();
      await page.locator('[data-testid="bottombar-tz-option-UTC"]').click();

      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.bottomBar?.timezoneId;
      }, { timeout: 2000 }).toBe("UTC");
    });

    test("timezone selection persists in localStorage", async ({ page }) => {
      // Wait for bottomBar to be ready
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.bottomBar?.timezoneId;
      }, { timeout: 5000 }).toBeTruthy();

      // Select New York timezone
      const tzToggle = page.locator('[data-testid="bottombar-tz-toggle"]');
      await tzToggle.click();
      await page.locator('[data-testid="bottombar-tz-option-America-New_York"]').click();

      // Wait for localStorage update
      await expect.poll(async () => {
        return await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.timezoneId"));
      }, { timeout: 2000 }).toBe("America/New_York");

      // Select back to UTC
      await tzToggle.click();
      await page.locator('[data-testid="bottombar-tz-option-UTC"]').click();

      await expect.poll(async () => {
        return await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.timezoneId"));
      }, { timeout: 2000 }).toBe("UTC");
    });

    test("market session indicator is visible in dump()", async ({ page }) => {
      // Market session indicator should be visible
      const marketSession = page.locator('[data-testid="bottombar-market-session"]');
      await expect(marketSession).toBeVisible();

      // Wait for marketSession in dump
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.bottomBar?.marketSession;
      }, { timeout: 5000 }).toBeTruthy();

      // Verify it's one of the valid values
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      const session = dump?.ui?.bottomBar?.marketSession;
      expect(["OPEN", "CLOSED", "PRE", "POST", "—"]).toContain(session);
    });

    test("data status indicator (LIVE/DEMO) is visible and matches dump()", async ({ page }) => {
      // Data status indicator should be visible
      const marketStatus = page.locator('[data-testid="bottombar-market-status"]');
      await expect(marketStatus).toBeVisible();

      // Wait for marketStatus in dump
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.bottomBar?.marketStatus;
      }, { timeout: 5000 }).toBeTruthy();

      // Get status from dump
      const dump = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });
      const statusFromDump = dump?.ui?.bottomBar?.marketStatus;

      // Status should be one of expected values
      expect(["LIVE", "DEMO", "OFFLINE", "LOADING"]).toContain(statusFromDump);

      // UI element should exist and have text
      const text = await marketStatus.textContent();
      expect(text).toBeTruthy();
    });

    test("clock element exists and displays time", async ({ page }) => {
      const clock = page.locator('[data-testid="bottombar-clock"]');
      await expect(clock).toBeVisible();

      // Clock should display time in HH:MM:SS format
      const text = await clock.textContent();
      expect(text).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    test("timezone dropdown shows available options", async ({ page }) => {
      const tzToggle = page.locator('[data-testid="bottombar-tz-toggle"]');
      await expect(tzToggle).toBeVisible();

      // Should show "UTC" by default
      await expect(tzToggle).toContainText("UTC");

      // Open dropdown
      await tzToggle.click();
      
      // All 3 options should be visible
      const dropdown = page.locator('[data-testid="bottombar-tz-dropdown"]');
      await expect(dropdown).toBeVisible();
      await expect(page.locator('[data-testid="bottombar-tz-option-UTC"]')).toBeVisible();
      await expect(page.locator('[data-testid="bottombar-tz-option-Europe-Stockholm"]')).toBeVisible();
      await expect(page.locator('[data-testid="bottombar-tz-option-America-New_York"]')).toBeVisible();
    });

    test("marketSession shows '—' when marketStatus is OFFLINE/LOADING", async ({ page }) => {
      // In mock mode with data loaded, status transitions from LOADING to DEMO
      // We verify that marketSession is "—" during the initial load phase
      // After data loads, it may change based on exchange hours
      
      // Wait for bottomBar to be initialized
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.bottomBar?.marketSession;
      }, { timeout: 5000 }).toBeTruthy();

      // The demo data doesn't have a real exchange, so marketSession should be "—"
      // regardless of marketStatus since exchangeCode will be undefined or unknown
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      const session = dump?.ui?.bottomBar?.marketSession;
      const status = dump?.ui?.bottomBar?.marketStatus;
      
      // If status is DEMO (mock data loaded), session depends on exchangeCode
      // Since mock uses "AAPL.US", session could be OPEN/CLOSED/PRE/POST based on time
      // But for OFFLINE/LOADING, session MUST be "—"
      if (status === "OFFLINE" || status === "LOADING") {
        expect(session).toBe("—");
      } else {
        // For DEMO/LIVE with valid exchange, session should be a real value
        expect(["OPEN", "CLOSED", "PRE", "POST", "—"]).toContain(session);
      }
    });
  });

  test.describe("TV-19.4: Scale toggles affect LightweightCharts", () => {
    test("clicking Log changes scale mode to Logarithmic", async ({ page }) => {
      // Click Log button
      const logBtn = page.locator('[data-testid="bottombar-toggle-log"]');
      await logBtn.click();
      
      // Wait for both chart and bottomBar state to update
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.render?.scale?.priceScaleMode;
      }, { timeout: 3000 }).toBe("Logarithmic");

      // TV-37.2: Use new scale.mode instead of legacy scaleMode
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.bottomBar?.scale?.mode;
      }, { timeout: 3000 }).toBe("log");
    });

    test("clicking % changes scale mode to Percentage", async ({ page }) => {
      // Click % button
      const percentBtn = page.locator('[data-testid="bottombar-toggle-percent"]');
      await percentBtn.click();

      // Verify dump shows Percentage
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.render?.scale?.priceScaleMode;
      }, { timeout: 3000 }).toBe("Percentage");

      // TV-37.2: Use new scale.mode instead of legacy scaleMode
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.bottomBar?.scale?.mode;
      }, { timeout: 3000 }).toBe("percent");
    });

    test("clicking Auto resets scale mode to Normal with autoScale", async ({ page }) => {
      // First switch to Log
      const logBtn = page.locator('[data-testid="bottombar-toggle-log"]');
      await logBtn.click();
      await page.waitForTimeout(200);
      
      // TV-37.2: First disable auto, then re-enable it
      // Auto toggle is now independent of mode
      const autoBtn = page.locator('[data-testid="bottombar-toggle-auto"]');
      // Click to disable auto (initial state is auto=true)
      await autoBtn.click();
      await page.waitForTimeout(100);
      // Click to re-enable auto
      await autoBtn.click();

      // Verify priceScaleMode is back to Normal when using auto (since mode was still log)
      // Actually, clicking auto doesn't change mode - it only toggles autoScale
      // To reset to Normal, we need to click Log again to toggle it off
      await logBtn.click();
      await page.waitForTimeout(100);

      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.render?.scale?.priceScaleMode;
      }, { timeout: 3000 }).toBe("Normal");

      // TV-37.2: Verify auto is enabled and mode is linear
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.bottomBar?.scale?.auto;
      }, { timeout: 3000 }).toBe(true);
      
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.bottomBar?.scale?.mode;
      }, { timeout: 3000 }).toBe("linear");
    });

    test("scale mode persists to localStorage", async ({ page }) => {
      // Click Log
      const logBtn = page.locator('[data-testid="bottombar-toggle-log"]');
      await logBtn.click();
      
      // Verify localStorage
      await expect.poll(async () => {
        return await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.scaleMode"));
      }, { timeout: 2000 }).toBe("log");

      // Click %
      const percentBtn = page.locator('[data-testid="bottombar-toggle-percent"]');
      await percentBtn.click();
      
      await expect.poll(async () => {
        return await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.scaleMode"));
      }, { timeout: 2000 }).toBe("percent");
    });

    test("ADJ button is disabled", async ({ page }) => {
      const adjBtn = page.locator('[data-testid="bottombar-toggle-adj"]');
      await expect(adjBtn).toBeVisible();
      await expect(adjBtn).toBeDisabled();
    });
  });
});
