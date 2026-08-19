import { describe, expect, it } from "vitest";
import {
  CABINET_ATTENTION_SEARCH_PLACEHOLDER,
  CABINET_ATTENTION_EDITOR_LINK_ATTRIBUTES,
  cabinetConfigAttentionReasons,
  cabinetFrontEndQuickEditUrl,
  cabinetConfigQuickEditUrl,
  distributorLineLabels,
  needsCabinetConfigAttention,
  selectedDistributorLineId,
} from "./cabinetConfigReview";

describe("cabinet configuration review queue", () => {
  it("uses a clear cabinet name-or-SKU search label beside the distributor filter", () => {
    expect(CABINET_ATTENTION_SEARCH_PLACEHOLDER).toBe("Search cabinet name or SKU…");
  });

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

  it("opens Cabinet Attention edits in the same front-end cabinet editor", () => {
    expect(cabinetFrontEndQuickEditUrl("B24 A/2")).toBe("/catalog/B24%20A%2F2?edit=1");
  });

  it("keeps the Cabinet Attention workspace open when launching the front-end editor", () => {
    expect(CABINET_ATTENTION_EDITOR_LINK_ATTRIBUTES).toEqual({
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("formats every linked distributor line once for fast queue scanning", () => {
    expect(distributorLineLabels("Ashford | Faircrest | Ashford")).toEqual(["Ashford", "Faircrest"]);
    expect(distributorLineLabels(null)).toEqual([]);
  });

  it("accepts only a real positive distributor-line identifier from the filter", () => {
    expect(selectedDistributorLineId("42")).toBe(42);
    expect(selectedDistributorLineId("__all__")).toBeUndefined();
    expect(selectedDistributorLineId("0")).toBeUndefined();
  });
});
