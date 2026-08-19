import { describe, expect, it } from "vitest";
import {
  cabinetConfigAttentionReasons,
  cabinetConfigQuickEditUrl,
  needsCabinetConfigAttention,
} from "./cabinetConfigReview";

describe("cabinet configuration review queue", () => {
  it("includes inactive cabinets, unverified cabinets, and cabinets with both statuses", () => {
    expect(needsCabinetConfigAttention({ isActive: false, configVerified: true })).toBe(true);
    expect(needsCabinetConfigAttention({ isActive: true, configVerified: false })).toBe(true);
    expect(needsCabinetConfigAttention({ isActive: false, configVerified: false })).toBe(true);
    expect(needsCabinetConfigAttention({ isActive: true, configVerified: true })).toBe(false);
  });

  it("labels every applicable review reason without inventing a status", () => {
    expect(cabinetConfigAttentionReasons({ isActive: false, configVerified: false })).toEqual([
      "Inactive",
      "Unverified",
    ]);
    expect(cabinetConfigAttentionReasons({ isActive: true, configVerified: false })).toEqual([
      "Unverified",
    ]);
    expect(cabinetConfigAttentionReasons({ isActive: true, configVerified: true })).toEqual([]);
  });

  it("deep-links each row to its exact Cabinet Config record", () => {
    expect(cabinetConfigQuickEditUrl(482)).toBe("/admin?tab=cabinet-config&cabinetId=482");
  });
});
