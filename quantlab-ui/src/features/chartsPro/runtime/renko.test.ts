/**
 * TV-22.0d1: Unit tests for Renko settings validation
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_RENKO_SETTINGS,
  normalizeRenkoSettings,
  validateRenkoField,
  type RenkoSettingsInput,
} from "./renko";

describe("normalizeRenkoSettings", () => {
  it("returns defaults for empty input", () => {
    const result = normalizeRenkoSettings({});
    expect(result.ok).toBe(false);
    expect(result.value).toEqual(DEFAULT_RENKO_SETTINGS);
  });

  it("validates correct settings", () => {
    const input: RenkoSettingsInput = {
      mode: "fixed",
      fixedBoxSize: 2.5,
      atrPeriod: 20,
      autoMinBoxSize: 0.5,
      rounding: "nice",
    };
    const result = normalizeRenkoSettings(input);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual(input);
    expect(result.errors).toEqual({});
  });

  it("accepts autoMinBoxSize = 0", () => {
    const input: RenkoSettingsInput = {
      mode: "auto",
      fixedBoxSize: 1,
      atrPeriod: 14,
      autoMinBoxSize: 0,
      rounding: "none",
    };
    const result = normalizeRenkoSettings(input);
    expect(result.ok).toBe(true);
    expect(result.value.autoMinBoxSize).toBe(0);
    expect(result.errors.autoMinBoxSize).toBeUndefined();
  });

  it("rejects autoMinBoxSize < 0", () => {
    const result = normalizeRenkoSettings({
      mode: "auto",
      fixedBoxSize: 1,
      atrPeriod: 14,
      autoMinBoxSize: -1,
      rounding: "none",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.autoMinBoxSize).toBe("Min box size must be ≥ 0");
    expect(result.value.autoMinBoxSize).toBe(DEFAULT_RENKO_SETTINGS.autoMinBoxSize);
  });

  it("rejects fixedBoxSize <= 0", () => {
    const result = normalizeRenkoSettings({
      mode: "fixed",
      fixedBoxSize: 0,
      atrPeriod: 14,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.fixedBoxSize).toBe("Box size must be > 0");
  });

  it("rejects fixedBoxSize > 10000", () => {
    const result = normalizeRenkoSettings({
      mode: "fixed",
      fixedBoxSize: 20000,
      atrPeriod: 14,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.fixedBoxSize).toBe("Box size must be ≤ 10000");
  });

  it("rejects atrPeriod < 1", () => {
    const result = normalizeRenkoSettings({
      mode: "auto",
      fixedBoxSize: 1,
      atrPeriod: 0,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.atrPeriod).toBe("ATR period must be ≥ 1");
  });

  it("rejects atrPeriod > 200", () => {
    const result = normalizeRenkoSettings({
      mode: "auto",
      fixedBoxSize: 1,
      atrPeriod: 300,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.atrPeriod).toBe("ATR period must be ≤ 200");
  });

  it("rejects non-integer atrPeriod", () => {
    const result = normalizeRenkoSettings({
      mode: "auto",
      fixedBoxSize: 1,
      atrPeriod: 14.5,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.atrPeriod).toBe("ATR period must be an integer");
  });

  it("rejects invalid mode", () => {
    const result = normalizeRenkoSettings({
      mode: "invalid" as any,
      fixedBoxSize: 1,
      atrPeriod: 14,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.mode).toBe("Mode must be 'auto' or 'fixed'");
    expect(result.value.mode).toBe(DEFAULT_RENKO_SETTINGS.mode);
  });

  it("rejects invalid rounding", () => {
    const result = normalizeRenkoSettings({
      mode: "auto",
      fixedBoxSize: 1,
      atrPeriod: 14,
      autoMinBoxSize: 0.01,
      rounding: "invalid" as any,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.rounding).toBe("Rounding must be 'none' or 'nice'");
  });

  it("handles string inputs (from form)", () => {
    const result = normalizeRenkoSettings({
      mode: "fixed",
      fixedBoxSize: "2.5",
      atrPeriod: "14",
      autoMinBoxSize: "0",
      rounding: "nice",
    });
    expect(result.ok).toBe(true);
    expect(result.value.fixedBoxSize).toBe(2.5);
    expect(result.value.atrPeriod).toBe(14);
    expect(result.value.autoMinBoxSize).toBe(0);
  });

  it("handles empty string inputs", () => {
    const result = normalizeRenkoSettings({
      mode: "fixed",
      fixedBoxSize: "",
      atrPeriod: "",
      autoMinBoxSize: "",
      rounding: "none",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.fixedBoxSize).toBe("Box size must be a number");
    expect(result.errors.atrPeriod).toBe("ATR period must be a number");
    expect(result.errors.autoMinBoxSize).toBe("Min box size must be a number");
  });

  it("collects multiple errors", () => {
    const result = normalizeRenkoSettings({
      mode: "invalid" as any,
      fixedBoxSize: -1,
      atrPeriod: 0,
      autoMinBoxSize: -0.5,
      rounding: "bad" as any,
    });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors)).toHaveLength(5);
  });
});

describe("validateRenkoField", () => {
  it("validates mode field", () => {
    expect(validateRenkoField("mode", "auto").valid).toBe(true);
    expect(validateRenkoField("mode", "fixed").valid).toBe(true);
    expect(validateRenkoField("mode", "invalid").valid).toBe(false);
  });

  it("validates fixedBoxSize field", () => {
    expect(validateRenkoField("fixedBoxSize", 1).valid).toBe(true);
    expect(validateRenkoField("fixedBoxSize", "2.5").valid).toBe(true);
    expect(validateRenkoField("fixedBoxSize", 0).valid).toBe(false);
    expect(validateRenkoField("fixedBoxSize", "").valid).toBe(false);
  });

  it("validates atrPeriod field", () => {
    expect(validateRenkoField("atrPeriod", 14).valid).toBe(true);
    expect(validateRenkoField("atrPeriod", "20").valid).toBe(true);
    expect(validateRenkoField("atrPeriod", 0).valid).toBe(false);
    expect(validateRenkoField("atrPeriod", 14.5).valid).toBe(false);
    expect(validateRenkoField("atrPeriod", 201).valid).toBe(false);
  });

  it("validates autoMinBoxSize field", () => {
    expect(validateRenkoField("autoMinBoxSize", 0).valid).toBe(true);
    expect(validateRenkoField("autoMinBoxSize", "0").valid).toBe(true);
    expect(validateRenkoField("autoMinBoxSize", 0.5).valid).toBe(true);
    expect(validateRenkoField("autoMinBoxSize", -1).valid).toBe(false);
  });

  it("validates rounding field", () => {
    expect(validateRenkoField("rounding", "none").valid).toBe(true);
    expect(validateRenkoField("rounding", "nice").valid).toBe(true);
    expect(validateRenkoField("rounding", "invalid").valid).toBe(false);
  });
});
