import { describe, expect, it } from "vitest";
import { installationEstimateStatusAction, isCustomerVisibleInstallationEstimate } from "./installationEstimateStatus";

describe("installation estimate customer visibility", () => {
  it("exposes only shared and accepted installation documents to customers", () => {
    expect(isCustomerVisibleInstallationEstimate("draft")).toBe(false);
    expect(isCustomerVisibleInstallationEstimate("shared")).toBe(true);
    expect(isCustomerVisibleInstallationEstimate("accepted")).toBe(true);
    expect(isCustomerVisibleInstallationEstimate("cancelled")).toBe(false);
  });

  it("offers a share action only while an estimate is a draft", () => {
    expect(installationEstimateStatusAction("draft")).toBe("share");
    expect(installationEstimateStatusAction("shared")).toBeNull();
    expect(installationEstimateStatusAction("accepted")).toBeNull();
    expect(installationEstimateStatusAction("cancelled")).toBeNull();
  });
});
