import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers/affiliateLiterature.ts"), "utf8");
const componentSource = readFileSync(resolve(process.cwd(), "client/src/components/admin/AffiliateLiteratureAdmin.tsx"), "utf8");
const schemaSource = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
const navigationSource = readFileSync(resolve(process.cwd(), "client/src/components/admin/AdminGroupedTabs.tsx"), "utf8");

describe("affiliate literature library contracts", () => {
  it("stores documents in a dedicated table with draft/published metadata", () => {
    expect(schemaSource).toContain('mysqlTable("affiliate_literature"');
    expect(schemaSource).toContain("isPublished: boolean(\"isPublished\")");
    expect(schemaSource).toContain("category: varchar(\"category\"");
    expect(schemaSource).toContain("fileKey: varchar(\"fileKey\"");
  });

  it("keeps all document mutations admin-only and uses object storage", () => {
    expect(routerSource).toContain("adminProcedure");
    expect(routerSource).toContain("storagePut(fileKey, buffer, input.mimeType)");
    expect(routerSource).toContain("MAX_FILE_BYTES = 24 * 1024 * 1024");
    expect(routerSource).toContain('application/pdf');
    expect(routerSource).toContain("adminUpload");
    expect(routerSource).toContain("adminUpdate");
    expect(routerSource).toContain("adminDelete");
  });

  it("exposes the operational controls admins need", () => {
    expect(componentSource).toContain("Affiliate Literature Library");
    expect(componentSource).toContain("Publish to affiliate library");
    expect(componentSource).toContain("Library contents");
    expect(componentSource).toContain("accept=\".pdf,.docx,.xlsx,.pptx,.txt,application/pdf\"");
    expect(navigationSource).toContain('value: "affiliate-literature"');
    expect(navigationSource).toContain('<AffiliateLiteratureAdmin />');
  });
});
