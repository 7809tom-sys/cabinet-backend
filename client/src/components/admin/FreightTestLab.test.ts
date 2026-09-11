import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/components/admin/FreightTestLab.tsx"), "utf8");
const shippingAdminSource = readFileSync(resolve(process.cwd(), "client/src/components/admin/ShippingAdmin.tsx"), "utf8");

describe("Operations Freight Test Lab UI", () => {
  it("uses a saved design instead of manual catalog-item entry", () => {
    expect(shippingAdminSource).toContain("<FreightTestLab />");
    expect(source).toContain("adminListSimulationDesigns");
    expect(source).toContain("adminSimulateSavedDesignFreight");
    expect(source).toContain("Saved design");
    expect(source).toContain("Choose a saved design");
    expect(source).not.toContain("adminSearchSimulationItems");
  });

  it("supports a live quote, pallet preview, and Plan B without order or payment creation", () => {
    expect(source).toContain('value="pallet_preview"');
    expect(source).toContain('value="saved_configuration"');
    expect(source).toContain('value="plan_b"');
    expect(source).toContain("never creates an order, checkout, signed customer quote, or payment");
    expect(source).toContain("Plan A and Plan B comparison");
    expect(source).toContain("resultsByMode");
    expect(source).toContain("function invalidateResults()");
    expect(source).toContain('useState<SimulationMode>("saved_configuration")');
    expect(source).toContain("Carrier shipping quote");
    expect(source).toContain("Carrier shipping quote summary");
    expect(source).toContain("Get carrier shipping quote");
    expect(source).toContain("Configure carrier quote settings");
    expect(source).toContain("WWEX is temporarily busy. Wait, then try again; your saved credentials do not need to be replaced.");
    expect(source).toContain("Pallets only — no shipping cost");
    expect(source).toContain("Staging class 175 used · saved setting unchanged");
    expect(source).not.toContain("orders.create");
    expect(source).not.toContain("payments.");
  });

  it("lets an administrator enter the delivery ZIP alongside the selected saved design", () => {
    expect(source).toContain("Destination ZIP");
    expect(source).toContain("Enter the delivery ZIP here, then request a WWEX staging carrier quote");
    expect(source).toContain("Saved design:");
    expect(source).toContain("no longer match the current catalog and were not tested");
    expect(source).toContain("has no Shipping Origin ZIP. This test uses the Operations origin only");
    expect(source).toContain("Add Shipping Origin ZIP");
    expect(source).toContain("Add {group.missingOriginStyle.distributorName} Shipping Origin ZIP");
    expect(source).toContain("adminUpdateDoorStyle.useMutation");
    expect(source).toContain("Save Shipping Origin ZIP");
  });

  it("shows Business/Residential accessorials and final pallet dimensions and loaded weights", () => {
    expect(source).toContain('value="business"');
    expect(source).toContain('value="residential"');
    expect(source).toContain("Lift gate");
    expect(source).toContain("Inside delivery");
    expect(source).toContain("Limited access");
    expect(source).toContain("Loaded weight");
    expect(source).toContain("pallet.lengthIn");
    expect(source).toContain("pallet.widthIn");
    expect(source).toContain("pallet.heightIn");
    expect(source).toContain("pallet.weightLbs");
  });
});
