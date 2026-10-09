import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("./CabinetConfigAdmin.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("./CabinetAvailabilityPanel.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../../../../server/routers/catalog.ts", import.meta.url), "utf8");

describe("Cabinet Config lists every cabinet and filters by distributor", () => {
  it("does not hide retired duplicates unless the admin opts in", () => {
    expect(server).toMatch(/if \(input\.hideRetired\) conditions\.push\(isCanonicalCabinetMaster\(\)\)/);
    expect(ui).toMatch(/hideRetired,/);
  });
  it("sends the distributor filter and shows a match count", () => {
    expect(ui).toMatch(/distributorId: distributorFilter/);
    expect(ui).toContain("cabinet-config-count");
  });
  it("shows ON/OFF per distributor line and door style", () => {
    expect(panel).toContain("adminAvailabilityList");
    expect(panel).toContain("availability-style");
    expect(server).toContain("adminAvailabilityStyles");
  });
});
