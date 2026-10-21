import { describe, expect, it } from "vitest";
import { newlyRequestedCrmHelpKinds, recipientsForCrmHelpNotification } from "./crmHelpNotifications";

const enabledSettings = {
  enabled: true,
  notifyOnCrmDesignHelp: true,
  notifyOnCrmShippingHelp: true,
  onCrmDesignHelp: "design@cabinetdealz.com, design@cabinetdealz.com; lead.designer@example.com",
  onCrmShippingHelp: "shipping@cabinetdealz.com",
};

describe("CRM help notification recipients", () => {
  it("does not plan any email until the global setting, matching event toggle, and recipient list are all enabled", () => {
    expect(recipientsForCrmHelpNotification({ ...enabledSettings, enabled: false }, "design")).toEqual([]);
    expect(recipientsForCrmHelpNotification({ ...enabledSettings, notifyOnCrmDesignHelp: false }, "design")).toEqual([]);
    expect(recipientsForCrmHelpNotification({ ...enabledSettings, onCrmShippingHelp: "" }, "shipping")).toEqual([]);
  });

  it("returns only the configured matching team with trimmed, unique addresses", () => {
    expect(recipientsForCrmHelpNotification(enabledSettings, "design")).toEqual([
      "design@cabinetdealz.com",
      "lead.designer@example.com",
    ]);
    expect(recipientsForCrmHelpNotification(enabledSettings, "shipping")).toEqual([
      "shipping@cabinetdealz.com",
    ]);
  });

  it("creates a notification event only for an explicit false-to-true help transition", () => {
    expect(newlyRequestedCrmHelpKinds(
      { needsHelpDesigning: false, needsHelpShipping: false },
      { needsHelpDesigning: true, needsHelpShipping: true },
    )).toEqual(["design", "shipping"]);
    expect(newlyRequestedCrmHelpKinds(
      { needsHelpDesigning: true, needsHelpShipping: true },
      { needsHelpDesigning: true, needsHelpShipping: true },
    )).toEqual([]);
    expect(newlyRequestedCrmHelpKinds(
      { needsHelpDesigning: true, needsHelpShipping: false },
      { needsHelpDesigning: false, needsHelpShipping: false },
    )).toEqual([]);
  });
});
