import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Fabrication Shops admin tab", () => {
  it("is registered next to Countertop Quotes", () => {
    const tabs = read("client/src/components/admin/AdminGroupedTabs.tsx");
    expect(tabs).toContain('{ value: "fab-shops", label: "Fabrication Shops" }');
    expect(tabs).toContain('<TabsContent value="fab-shops"');
    expect(tabs).toContain("import FabShopsAdmin from \"@/components/admin/FabShopsAdmin\"");
  });

  it("uses the existing fabShops router rather than a second shop table", () => {
    const ui = read("client/src/components/admin/FabShopsAdmin.tsx");
    expect(ui).toContain("trpc.fabShops.list.useQuery");
    expect(ui).toContain("trpc.fabShops.imports.useQuery");
    expect(ui).toContain("trpc.fabShops.undoImport.useMutation");
    // No hand-rolled queries to a table that may not exist yet; all reads go through the router.
    expect(ui).not.toContain("drizzle/schema");
  });

  it("explains what to run when the tables are missing, like the quote tab does", () => {
    const ui = read("client/src/components/admin/FabShopsAdmin.tsx");
    expect(ui).toContain("list.data?.ready");
    expect(ui).toContain("docs/sql/0291");
  });

  it("guards undo with the count the server requires", () => {
    const ui = read("client/src/components/admin/FabShopsAdmin.tsx");
    expect(ui).toContain("confirmCount: entry.shops");
    expect(ui).toContain("window.confirm(");
  });
});
