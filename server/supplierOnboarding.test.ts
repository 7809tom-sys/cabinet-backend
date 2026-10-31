import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../data/distributors/", import.meta.url).pathname;
const folders = readdirSync(root).filter((name) => statSync(join(root, name)).isDirectory());

describe("supplier onboarding", () => {
  it("has at least one supplier folder", () => {
    expect(folders.length).toBeGreaterThan(0);
  });

  for (const folder of folders) {
    describe(folder, () => {
      const path = join(root, folder, "supplier.json");

      it("has a supplier.json with the required blocks, each with a source", () => {
        expect(existsSync(path)).toBe(true);
        const supplier = JSON.parse(readFileSync(path, "utf8"));
        expect(typeof supplier.name).toBe("string");
        expect(typeof supplier.code).toBe("string");
        expect(supplier.website.url).toMatch(/^https:\/\//);
        expect(supplier.specBook.url).toMatch(/^https:\/\//);
        expect("savedFilename" in supplier.specBook).toBe(true);
        expect(Array.isArray(supplier.freightOrigins.warehouseZips)).toBe(true);
        for (const zip of supplier.freightOrigins.warehouseZips) expect(zip).toMatch(/^\d{5}$/);
        for (const block of ["website", "specBook", "freightOrigins", "contactAndOrdering"]) {
          expect(typeof supplier[block].source).toBe("string");
        }
      });
    });
  }

  it("records DL Cabinetry's website, spec book and all six freight origins", () => {
    const dl = JSON.parse(readFileSync(join(root, "dl-cabinetry", "supplier.json"), "utf8"));
    expect(dl.website.url).toBe("https://www.dlcabinetry.com");
    expect(dl.specBook.url).toBe("https://www.dlcabinetry.com/_files/ugd/bd0079_982d3ca8295d49f6b917c3f814615612.pdf");
    expect(dl.specBook.version).toBe("v.11/14/23");
    expect(dl.freightOrigins.warehouseZips).toEqual(["32256", "78754", "37086", "70126", "32822", "33634"]);
  });
});
