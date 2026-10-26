import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planUsCabinetDepotProductLines, type CatalogLineRecord, type VendorLineRecord } from "./uscdProductLines";
import { resolveVendorCatalogLineId } from "./approvedVendorAccess";

const madison: CatalogLineRecord = {
  id: 1,
  code: "USCD",
  name: "Madison",
  brandName: "Madison",
  isActive: true,
};
const aef: CatalogLineRecord = {
  id: 4,
  code: "AEF",
  name: "US Cabinet Depot Frameless",
  brandName: "U.S. Cabinet Depot — Frameless",
  isActive: true,
};
const ashford: CatalogLineRecord = {
  id: 2,
  code: "CS",
  name: "Ashford",
  brandName: "Clark & Son",
  isActive: true,
};
const uscdVendor: VendorLineRecord = {
  id: 9,
  name: "US Cabinet Depot",
  sourceKey: "dist:4",
  linkedDistributorIds: null,
  isApproved: true,
};
const clarkVendor: VendorLineRecord = {
  id: 10,
  name: "Clark & Son",
  sourceKey: "dist:2",
  linkedDistributorIds: [2],
  isApproved: true,
};

describe("U.S. Cabinet Depot AEF and Madison catalog lines", () => {
  it("links the existing AEF distributor and the USCD Madison line without touching other vendors", () => {
    const plan = planUsCabinetDepotProductLines({
      distributors: [madison, aef, ashford],
      vendors: [uscdVendor, clarkVendor],
    });

    expect(plan.blocked).toBeNull();
    expect(plan.vendorId).toBe(9);
    expect(plan.vendorName).toBe("US Cabinet Depot");
    expect(plan.createVendor).toBe(false);
    expect(plan.sourceKeyToSet).toBeNull();
    expect(plan.lines.map((line) => [line.role, line.action, line.distributorId, line.code])).toEqual([
      ["AEF", "link", 4, "AEF"],
      ["Madison", "link", 1, "USCD"],
    ]);
    expect(plan.linkedDistributorIds).toEqual([1, 4]);
    expect(plan.notes.join("\n")).toContain("US Cabinet Depot Frameless");
    expect(plan.notes.join("\n")).toContain("no second Madison distributor was created");
    expect(plan.notes.join("\n")).toContain("existing source key was left unchanged");
    expect(plan.notes.join("\n")).not.toContain("Ashford");
  });

  it("keeps an administrator’s extra link and does not create duplicates on a second pass", () => {
    const first = planUsCabinetDepotProductLines({
      distributors: [madison, aef],
      vendors: [{ ...uscdVendor, linkedDistributorIds: [7, 1] }],
    });
    const second = planUsCabinetDepotProductLines({
      distributors: [madison, aef],
      vendors: [{ ...uscdVendor, linkedDistributorIds: first.linkedDistributorIds }],
    });

    expect(first.linkedDistributorIds).toEqual([1, 4, 7]);
    expect(second.linkedDistributorIds).toEqual([1, 4, 7]);
    expect(second.lines.every((line) => line.action === "link")).toBe(true);
  });

  it("maps a frameless series that already exists under another distributor code instead of creating AEF", () => {
    const frameless: CatalogLineRecord = {
      id: 8,
      code: "FRAME",
      name: "US Cabinet Depot Frameless",
      brandName: null,
      isActive: true,
    };
    const plan = planUsCabinetDepotProductLines({
      distributors: [madison, frameless],
      vendors: [{ ...uscdVendor, sourceKey: "dist:1" }],
    });

    expect(plan.lines.find((line) => line.role === "AEF")).toMatchObject({
      action: "link",
      distributorId: 8,
      code: "FRAME",
    });
    expect(plan.lines.find((line) => line.role === "Madison")).toMatchObject({ distributorId: 1, code: "USCD" });
    expect(plan.notes.join(" ")).toContain("No duplicate AEF distributor was created");
  });

  it("maps AEF onto the Madison distributor when that record already holds the frameless cabinets", () => {
    const plan = planUsCabinetDepotProductLines({
      distributors: [madison],
      vendors: [{ ...uscdVendor, sourceKey: "dist:1" }],
      framelessDistributorIds: [1],
    });

    expect(plan.lines.map((line) => line.distributorId)).toEqual([1, 1]);
    expect(plan.linkedDistributorIds).toEqual([1]);
    expect(plan.notes.join(" ")).toContain("share one distributor record");
    expect(plan.lines.every((line) => line.action === "link")).toBe(true);
  });

  it("creates AEF and Madison only when neither line exists", () => {
    const plan = planUsCabinetDepotProductLines({ distributors: [], vendors: [] });

    expect(plan.createVendor).toBe(true);
    expect(plan.vendorName).toBe("US Cabinet Depot");
    expect(plan.lines).toEqual([
      expect.objectContaining({ role: "AEF", action: "create", code: "AEF", name: "AEF" }),
      expect.objectContaining({ role: "Madison", action: "create", code: "MADISON", name: "Madison" }),
    ]);
  });

  it("does not guess when several Madison-named distributors exist", () => {
    const plan = planUsCabinetDepotProductLines({
      distributors: [
        { id: 3, code: "M1", name: "Madison", brandName: null, isActive: true },
        { id: 5, code: "M2", name: "Other", brandName: "Madison", isActive: true },
      ],
      vendors: [uscdVendor],
    });

    expect(plan.blocked).toContain("More than one distributor is named Madison");
    expect(plan.lines).toEqual([]);
  });

  it("runs from the server start path so a deploy applies the link", () => {
    const startup = readFileSync(new URL("../_core/index.ts", import.meta.url), "utf8");
    expect(startup).toContain("ensureUsCabinetDepotProductLines");
  });
});

describe("vendor catalog line selection", () => {
  it("lets a signed-in vendor open a linked line and refuses every other line", () => {
    expect(resolveVendorCatalogLineId(false, 4, 1, [1, 4])).toBe(1);
    expect(resolveVendorCatalogLineId(false, 4, 4, [1, 4])).toBe(4);
    expect(resolveVendorCatalogLineId(false, 4, undefined, [1, 4])).toBe(4);
    expect(() => resolveVendorCatalogLineId(false, 4, 2, [1, 4])).toThrow(/not linked to your vendor account/);
  });
});
