import { describe, expect, it } from "vitest";
import {
  CABINET_ATTENTION_SEARCH_PLACEHOLDER,
  CABINET_ATTENTION_EDITOR_LINK_ATTRIBUTES,
  CABINET_ATTENTION_RETURN_URL,
  DESIGNER_COVERAGE_RETURN_URL,
  DISTRIBUTOR_CONNECTION_REQUIRED_MESSAGE,
  cabinetConfigAttentionReasons,
  cabinetDesignerCoverageGapEditUrl,
  cabinetFrontEndQuickEditUrl,
  canFinalizeCabinetConfiguration,
  cabinetConfigQuickEditUrl,
  distributorLineLabels,
  needsCabinetConfigAttention,
  selectedDistributorLineId,
  shouldShowCabinetAttentionReturn,
  shouldShowDesignerCoverageReturn,
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

  it("keeps any missing-price record exclusively in Unpriced Items", () => {
    expect(needsCabinetConfigAttention({
      isActive: false,
      configVerified: false,
      hasPositivePublishedPrice: false,
    })).toBe(false);
    expect(cabinetConfigAttentionReasons({
      isActive: false,
      configVerified: false,
      hasPositivePublishedPrice: false,
    })).toEqual([]);
    expect(needsCabinetConfigAttention({
      isActive: false,
      configVerified: false,
      hasPositivePublishedPrice: 0,
    })).toBe(false);
    expect(needsCabinetConfigAttention({
      isActive: false,
      configVerified: false,
      hasPositivePublishedPrice: true,
    })).toBe(true);
  });

  it("deep-links each row to its exact Cabinet Config record", () => {
    expect(cabinetConfigQuickEditUrl(482)).toBe("/admin?tab=cabinet-config&cabinetId=482");
  });

  it("opens Cabinet Attention edits in the same front-end cabinet editor", () => {
    expect(cabinetFrontEndQuickEditUrl("B24 A/2", 482)).toBe("/catalog/B24%20A%2F2?edit=1&cabinetId=482&from=cabinet-attention");
  });

  it("deep-links a missing Designer Coverage cell to its exact cabinet, style, and distributor line", () => {
    expect(cabinetDesignerCoverageGapEditUrl("B24 A/2", 482, 95, 4)).toBe(
      "/catalog/B24%20A%2F2?edit=1&cabinetId=482&style=95&distributorId=4&from=designer-coverage",
    );
  });

  it("provides a direct return destination for phone users editing from Cabinet Attention", () => {
    expect(CABINET_ATTENTION_RETURN_URL).toBe("/admin?tab=cabinet-attention");
  });

  it("shows Cabinet Attention return navigation only to administrators from that queue", () => {
    expect(shouldShowCabinetAttentionReturn(true, "cabinet-attention")).toBe(true);
    expect(shouldShowCabinetAttentionReturn(false, "cabinet-attention")).toBe(false);
    expect(shouldShowCabinetAttentionReturn(true, "catalog")).toBe(false);
    expect(shouldShowCabinetAttentionReturn(true, null)).toBe(false);
  });

  it("shows the Designer Coverage return navigation only to administrators from that matrix", () => {
    expect(DESIGNER_COVERAGE_RETURN_URL).toBe("/admin?tab=coverage&gapsOnly=1");
    expect(shouldShowDesignerCoverageReturn(true, "designer-coverage")).toBe(true);
    expect(shouldShowDesignerCoverageReturn(false, "designer-coverage")).toBe(false);
    expect(shouldShowDesignerCoverageReturn(true, "cabinet-attention")).toBe(false);
  });

  it("keeps the Cabinet Attention workspace open when launching the front-end editor", () => {
    expect(CABINET_ATTENTION_EDITOR_LINK_ATTRIBUTES).toEqual({
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("requires a distributor SKU connection before cabinet configuration is finalized", () => {
    expect(canFinalizeCabinetConfiguration(0)).toBe(false);
    expect(canFinalizeCabinetConfiguration(null)).toBe(false);
    expect(canFinalizeCabinetConfiguration(1)).toBe(true);
    expect(DISTRIBUTOR_CONNECTION_REQUIRED_MESSAGE).toContain("distributor line");
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
