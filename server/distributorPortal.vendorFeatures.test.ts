import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const router = readFileSync(resolve(process.cwd(), "server/routers/distributorPortal.ts"), "utf8");
const portal = readFileSync(resolve(process.cwd(), "client/src/pages/VendorPortal.tsx"), "utf8");
const schema = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");

describe("distributor vendor portal catalog and integration contracts", () => {
  it("offers owned-line catalog archive, history, and CSV export procedures", () => {
    expect(router).toContain("uploadCatalogFile: distributorProcedure");
    expect(router).toContain("catalogFileHistory: distributorProcedure");
    expect(router).toContain("exportCatalog: distributorProcedure");
    expect(router).toContain("distributor-catalogs/${lineId}/");
    expect(router).toContain('fileName: `catalog-${lineId}-');
    expect(portal).toContain("Catalog transfer center");
    expect(portal).toContain("Download current CSV");
  });

  it("supports inventory and shipping integrations for every distributor", () => {
    expect(router).toContain("listIntegrations: distributorProcedure");
    expect(router).toContain("saveIntegration: distributorProcedure");
    expect(router).toContain('integrationType: z.enum(["inventory", "shipping"])');
    expect(router).toContain("encryptDistributorSecret(input.apiKey)");
    expect(router).toContain("encryptDistributorSecret(input.clientSecret)");
    expect(router).toContain("encryptDistributorSecret(input.password)");
    expect(router).not.toContain("apiKeyEncrypted: distributorIntegrations.apiKeyEncrypted");
    expect(portal).toContain("Oracle NetSuite");
    expect(portal).toContain("UPS Rating API");
    expect(portal).toContain("FedEx Rate API");
    expect(router).toContain('fulfillmentMode: input.isEnabled ? "netsuite_api" : "email"');
    expect(router).toContain("netsuiteAccountId: input.accountNumber?.trim() || null");
    expect(portal).toContain("vendor-carrier-connections");
    expect(portal).toContain("NetSuite inventory");
    expect(portal).toContain("UPS / parcel");
    expect(portal).toContain("FedEx / parcel");
    expect(portal).toContain("new catalog styles use the same locations automatically");
    expect(router).toContain("integrationHistory: distributorProcedure");
    expect(router).toContain("testIntegrationConnection: distributorProcedure");
    expect(router).toContain("distributorIntegrationEvents");
    expect(portal).toContain("Test connection");
    expect(portal).toContain("Recent connection attempts");
    expect(schema).toContain('export const distributorIntegrationEvents');
    expect(router).toContain("warehouseTemplate: adminProcedure");
    expect(router).toContain("saveWarehouseTemplate: adminProcedure");
    expect(portal).toContain("Shared warehouse template");
  });

  it("retains source photos and records normalization status", () => {
    expect(schema).toContain('sourceImageUrl: varchar("sourceImageUrl"');
    expect(schema).toContain('imageRerenderStatus: varchar("imageRerenderStatus"');
    expect(router).toContain("vendor-products-source/${lineId}/");
    expect(router).toContain("generateImage({");
    expect(router).toContain('imageRerenderStatus: "completed"');
  });
});
