import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers/catalog.ts"), "utf8");
const editorSource = readFileSync(resolve(process.cwd(), "client/src/components/admin/BulkDimensionsAdmin.tsx"), "utf8");

describe("catalog carton data audit", () => {
  it("offers a dedicated server-side audit for missing authoritative carton fields", () => {
    expect(routerSource).toContain("cartonDataMissingOnly: z.boolean().default(false)");
    expect(routerSource).toContain("if (input.cartonDataMissingOnly)");
    expect(routerSource).toContain("${cabinets.pkgLength} <= 0");
    expect(routerSource).toContain("${cabinets.pkgWidth} <= 0");
    expect(routerSource).toContain("${cabinets.pkgHeight} <= 0");
    expect(routerSource).toContain("${cabinets.pkgWeight} <= 0");
  });

  it("keeps the parcel-required carton filter separate from the legacy dimensions audit", () => {
    expect(editorSource).toContain("const [cartonDataMissingOnly, setCartonDataMissingOnly] = useState(false)");
    expect(editorSource).toContain("cartonDataMissingOnly,");
    expect(editorSource).toContain('id="carton-data-missing-only"');
    expect(editorSource).toContain("Missing carton data only");
    expect(editorSource).toContain("missingCartonDataCount");
  });
});
