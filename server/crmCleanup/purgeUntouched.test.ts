import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const customers = readFileSync(resolve(process.cwd(), "server/routers/customers.ts"), "utf8");
const customersAdmin = readFileSync(resolve(process.cwd(), "client/src/components/admin/CustomersAdmin.tsx"), "utf8");
const tabs = readFileSync(resolve(process.cwd(), "client/src/components/admin/AdminGroupedTabs.tsx"), "utf8");

describe("existing purge button", () => {
  it("still deletes every non-admin and does not use the cleanup keep list", () => {
    const purge = customers.slice(customers.indexOf("purgeTestMembers:"));
    expect(purge).toContain("sql`${users.role} != 'admin'`");
    expect(purge).not.toContain("keepUserIds");
    expect(purge).not.toContain("crmCleanup");
    expect(customersAdmin).toContain("Purge non-admins");
    expect(customersAdmin).toContain("purgeTestMembers");
    expect(customersAdmin).toContain("This button has no keep list");
    expect(customersAdmin).toContain("People → CRM Cleanup");
  });

  it("adds the cleanup page under People without removing Customers", () => {
    expect(tabs).toContain('{ value: "crm-cleanup", label: "CRM Cleanup" }');
    expect(tabs).toContain("<CrmCleanupAdmin />");
    expect(tabs).toContain('<TabsContent value="customers"');
  });
});
