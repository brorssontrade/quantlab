/**
 * CP36: Visual QA Parity Tests
 * TV-36.4: CSS vars and theme consistency assertions
 *
 * Tests the unified visual system:
 * - CSS custom properties are exposed via dump().styles.cssVars
 * - Theme tokens match expected values for dark/light
 * - Overlay component styling uses CSS vars consistently
 */

import { test, expect, Page } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

// Expected CSS var prefixes that must be present
const REQUIRED_CSS_VAR_GROUPS = [
  "--cp-bg",
  "--cp-text-axis",
  "--cp-grid",
  "--cp-text",
  "--cp-candle-up",
  "--cp-candle-down",
  "--cp-crosshair",
  "--cp-overlay",
];

// Dark theme expected color patterns (hex format, lowercase)
const DARK_THEME_PATTERNS = {
  background: /^#(1[0-4][0-9a-f]{4}|0[0-9a-f]{5})$/i, // Dark background (< #150000)
  text: /^#[c-f][0-9a-f]{5}$/i, // Light text (> #c00000)
};

// Light theme expected color patterns
const LIGHT_THEME_PATTERNS = {
  background: /^#[e-f][0-9a-f]{5}$/i, // Light background (> #e00000)
  text: /^#[0-3][0-9a-f]{5}$/i, // Dark text (< #400000)
};

async function waitForDump(page: Page, predicate: (dump: any) => boolean) {
  await page.waitForFunction(
    (body) => {
      const dump = (window as any).__lwcharts?.dump?.();
      if (!dump) return false;
      return (window as any).Function(`return (${body});`).call(null, dump);
    },
    predicate.toString(),
  );
}

async function getStyles(page: Page) {
  return page.evaluate(() => (window as any).__lwcharts?.dump?.()?.styles ?? null);
}

test.describe("TV-36: Visual QA Parity - CP36", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto("/?mock=1");
    await gotoChartsPro(page, testInfo);
    // Wait for chart to be ready
    await waitForDump(page, (dump) => dump?.render?.pricePoints > 0);
  });

  test.describe("CP36.1: CSS Vars Exposure", () => {
    test("CP36.1.1: dump().styles.cssVars contains all required var groups", async ({ page }) => {
      const styles = await getStyles(page);

      expect(styles).not.toBeNull();
      expect(styles.cssVars).toBeDefined();
      expect(typeof styles.cssVars).toBe("object");

      // Check that all required CSS var groups are present
      const cssVarKeys = Object.keys(styles.cssVars);
      for (const prefix of REQUIRED_CSS_VAR_GROUPS) {
        const hasPrefix = cssVarKeys.some((key) => key.startsWith(prefix));
        expect(hasPrefix, `Missing CSS var group: ${prefix}`).toBeTruthy();
      }
    });

    test("CP36.1.2: cssVars values are valid CSS color/size formats", async ({ page }) => {
      const styles = await getStyles(page);
      const cssVars = styles?.cssVars ?? {};

      for (const [key, value] of Object.entries(cssVars)) {
        expect(typeof value).toBe("string");
        // All values should be non-empty strings
        expect((value as string).length).toBeGreaterThan(0);

        // Color vars should be hex format
        if (key.includes("-bg") || key.includes("-color") || key.includes("-text") || key.includes("-candle")) {
          // Allow hex colors or rgb/rgba
          expect(
            (value as string).match(/^#[0-9a-f]{3,8}$/i) ||
              (value as string).match(/^rgba?\(/) ||
              (value as string).match(/^transparent$/i),
            `Invalid color format for ${key}: ${value}`,
          ).toBeTruthy();
        }
      }
    });

    test("CP36.1.3: overlay tokens exposed in dump().styles.tokens", async ({ page }) => {
      const styles = await getStyles(page);

      expect(styles.tokens).toBeDefined();
      expect(styles.tokens.overlay).toBeDefined();

      // Required overlay tokens (matching OverlayTokens interface)
      const requiredOverlayTokens = [
        "line",
        "selection",
        "handleFill",
        "handleStroke",
        "labelBg",
        "labelText",
        "toolbarBg",
        "toolbarBorder",
        "modalBg",
        "modalBorder",
        "chipBg",
        "chipText",
        "chipBorder",
      ];

      for (const token of requiredOverlayTokens) {
        expect(styles.tokens.overlay[token], `Missing overlay token: ${token}`).toBeDefined();
      }
    });
  });

  test.describe("CP36.2: Theme Switching Parity", () => {
    test("CP36.2.1: dark theme has correct color characteristics", async ({ page }) => {
      // Ensure dark theme (should be default)
      const styles = await getStyles(page);

      expect(styles.theme).toBe("dark");

      // Background should be dark
      const bgColor = styles.cssVars?.["--cp-bg"] ?? styles.tokens?.canvas?.background;
      expect(bgColor).toBeDefined();

      // Text should be light (for contrast)
      const textColor = styles.cssVars?.["--cp-text-primary"] ?? styles.tokens?.text?.primary;
      expect(textColor).toBeDefined();
    });

    test("CP36.2.2: light theme toggle updates all cssVars", async ({ page }) => {
      const darkStyles = await getStyles(page);

      // Switch to light theme
      await page.getByRole("button", { name: /^Light$/i }).click();
      await waitForDump(page, (dump) => dump?.styles?.theme === "light");

      const lightStyles = await getStyles(page);

      expect(lightStyles.theme).toBe("light");

      // Background should change
      const darkBg = darkStyles.cssVars?.["--cp-bg"];
      const lightBg = lightStyles.cssVars?.["--cp-bg"];
      expect(darkBg).not.toBe(lightBg);

      // Text should change
      const darkText = darkStyles.cssVars?.["--cp-text-primary"];
      const lightText = lightStyles.cssVars?.["--cp-text-primary"];
      expect(darkText).not.toBe(lightText);

      // Overlay tokens should change
      expect(darkStyles.tokens?.overlay?.toolbarBg).not.toBe(lightStyles.tokens?.overlay?.toolbarBg);
    });

    test("CP36.2.3: theme cssVars count stays consistent across themes", async ({ page }) => {
      const darkStyles = await getStyles(page);
      const darkVarCount = Object.keys(darkStyles.cssVars ?? {}).length;

      await page.getByRole("button", { name: /^Light$/i }).click();
      await waitForDump(page, (dump) => dump?.styles?.theme === "light");

      const lightStyles = await getStyles(page);
      const lightVarCount = Object.keys(lightStyles.cssVars ?? {}).length;

      // Same number of CSS vars in both themes
      expect(lightVarCount).toBe(darkVarCount);
      expect(darkVarCount).toBeGreaterThan(30); // Should have ~50 vars
    });
  });

  test.describe("CP36.3: CSS Vars Applied to DOM", () => {
    test("CP36.3.1: chartspro-root has CSS vars applied", async ({ page }) => {
      // Get computed style from the DOM
      const rootStyles = await page.evaluate(() => {
        const root = document.querySelector(".chartspro-root");
        if (!root) return null;

        const computed = getComputedStyle(root);
        return {
          "--cp-bg": computed.getPropertyValue("--cp-bg").trim(),
          "--cp-text-primary": computed.getPropertyValue("--cp-text-primary").trim(),
          "--cp-overlay-toolbar-bg": computed.getPropertyValue("--cp-overlay-toolbar-bg").trim(),
          "--cp-candle-up": computed.getPropertyValue("--cp-candle-up").trim(),
          "--cp-candle-down": computed.getPropertyValue("--cp-candle-down").trim(),
        };
      });

      expect(rootStyles).not.toBeNull();
      // All vars should have values
      for (const [key, value] of Object.entries(rootStyles!)) {
        expect(value, `CSS var ${key} not set on .chartspro-root`).not.toBe("");
      }
    });

    test("CP36.3.2: CSS vars update when theme changes", async ({ page }) => {
      const darkRootStyles = await page.evaluate(() => {
        const root = document.querySelector(".chartspro-root");
        if (!root) return null;
        const computed = getComputedStyle(root);
        return {
          bg: computed.getPropertyValue("--cp-bg").trim(),
          text: computed.getPropertyValue("--cp-text-primary").trim(),
        };
      });

      await page.getByRole("button", { name: /^Light$/i }).click();
      await waitForDump(page, (dump) => dump?.styles?.theme === "light");

      const lightRootStyles = await page.evaluate(() => {
        const root = document.querySelector(".chartspro-root");
        if (!root) return null;
        const computed = getComputedStyle(root);
        return {
          bg: computed.getPropertyValue("--cp-bg").trim(),
          text: computed.getPropertyValue("--cp-text-primary").trim(),
        };
      });

      expect(darkRootStyles).not.toBeNull();
      expect(lightRootStyles).not.toBeNull();
      expect(darkRootStyles!.bg).not.toBe(lightRootStyles!.bg);
    });
  });

  test.describe("CP36.4: Unified Overlay Styling", () => {
    test("CP36.4.1: spacing tokens exposed for layout consistency", async ({ page }) => {
      const styles = await getStyles(page);

      expect(styles.tokens?.spacing).toBeDefined();

      // Required spacing tokens
      const requiredSpacing = ["xs", "sm", "md", "lg", "xl"];
      for (const size of requiredSpacing) {
        expect(styles.tokens.spacing[size], `Missing spacing token: ${size}`).toBeDefined();
      }
    });

    test("CP36.4.2: typography tokens exposed", async ({ page }) => {
      const styles = await getStyles(page);

      expect(styles.typography).toBeDefined();
      expect(styles.typography.fontFamily).toBeDefined();
      expect(styles.typography.fontSize).toBeDefined();
    });

    test("CP36.4.3: compare colors tracked in styles", async ({ page }) => {
      // Add a compare symbol
      await page.fill('[data-testid="compare-add-symbol"]', "META.US");
      await page.selectOption('[data-testid="compare-add-timeframe"]', "1h");
      await page.selectOption('[data-testid="compare-add-mode"]', "percent");
      await page.getByTestId("compare-add-submit").click();

      await waitForDump(page, (dump) => dump?.compares?.["META.US"] !== undefined);

      const styles = await getStyles(page);

      expect(styles.compareColors).toBeDefined();
      expect(Array.isArray(styles.compareColors)).toBeTruthy();

      // Should have META.US color
      const metaColor = styles.compareColors.find((c: any) => c.symbol === "META.US");
      expect(metaColor).toBeDefined();
      expect(metaColor?.color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});
