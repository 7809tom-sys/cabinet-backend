/**
 * Guards the one-off Pelican photo backfill: the committed assets, the manifest,
 * the by-hand TiDB SQL file, and the storage upload script must agree exactly.
 *
 * The SQL is run by hand, so a mismatch here would silently point a catalog row
 * at a missing object or at another product's photo.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const imageDir = new URL("data/pelican/product-images/", root);
const manifest = JSON.parse(readFileSync(new URL("data/pelican/product-images-manifest.json", root), "utf8")) as {
  onlyFieldChanged: string;
  imageCount: number;
  catalogRowCount: number;
  images: Array<{
    asset: string;
    storageKey: string;
    sha256: string;
    sourceProductUrls: string[];
    sourceImageUrls: string[];
    matchRules: string[];
    catalogRows: Array<{ id: number; pelicanCode: string; category: string }>;
  }>;
};
const sql = readFileSync(new URL("docs/sql/0270_pelican_missing_product_images.tidb.sql", root), "utf8");
const script = readFileSync(new URL("scripts/upload-pelican-product-images.ts", root), "utf8");

const updates = sql.split("\n").filter((line) => line.startsWith("UPDATE "));

describe("Pelican missing-image photo backfill", () => {
  it("changes only imageUrl", () => {
    expect(manifest.onlyFieldChanged).toBe("pelican_products.imageUrl");
    for (const line of updates) {
      expect(line).toMatch(/^UPDATE cabinet_dealz\.pelican_products SET imageUrl = '[^']+' WHERE id = \d+ AND pelicanCode = '[^']+';$/);
    }
    // One field, one target table, no schema change, no other column written.
    // Only the SET clause is inspected: the WHERE clause legitimately names pelicanCode.
    for (const line of updates) {
      const setClause = line.slice(line.indexOf(" SET ") + 5, line.indexOf(" WHERE "));
      expect(setClause).toMatch(/^imageUrl = '[^']+'$/);
    }
    expect(sql).not.toMatch(/^[^-\n]*IF NOT EXISTS/im);
    const statements = sql.split("\n").filter((line) => /^(UPDATE|SELECT|ALTER|DROP|TRUNCATE|DELETE|INSERT|COMMIT)\b/i.test(line));
    expect(statements.every((line) => !/\b(ALTER|DROP|TRUNCATE|DELETE|INSERT)\b/i.test(line))).toBe(true);
    expect(updates.every((line) => line.includes("cabinet_dealz.pelican_products"))).toBe(true);
  });

  it("has one statement per manifest row and no stray rows", () => {
    const manifestRows = manifest.images.flatMap((image) => image.catalogRows);
    expect(manifest.imageCount).toBe(manifest.images.length);
    expect(manifest.catalogRowCount).toBe(manifestRows.length);
    expect(updates).toHaveLength(manifestRows.length);
    expect(new Set(manifestRows.map((row) => row.id)).size).toBe(manifestRows.length);
    for (const row of manifestRows) {
      expect(updates.some((line) => line.includes(`WHERE id = ${row.id} AND pelicanCode = '${row.pelicanCode}'`))).toBe(true);
    }
  });

  it("commits every manifest asset with the recorded checksum and a matching SQL path", () => {
    const onDisk = readdirSync(imageDir);
    expect(onDisk.sort()).toEqual(manifest.images.map((image) => image.asset).sort());
    for (const image of manifest.images) {
      const bytes = readFileSync(new URL(image.asset, imageDir));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(image.sha256);
      expect(bytes.length).toBeGreaterThan(0);
      expect(image.storageKey).toBe(`pelican/${image.asset}`);
      expect(sql).toContain(`'/manus-storage/${image.storageKey}'`);
      // Every row of an image points at that image's one storage key.
      for (const row of image.catalogRows) {
        const line = updates.find((entry) => entry.includes(`WHERE id = ${row.id} AND pelicanCode = '${row.pelicanCode}'`));
        expect(line).toContain(`= '/manus-storage/${image.storageKey}'`);
      }
    }
  });

  it("keeps each photo traceable to the official Pelican domain and a stated match rule", () => {
    for (const image of manifest.images) {
      expect(image.sourceProductUrls.length).toBeGreaterThan(0);
      expect(image.sourceImageUrls.length).toBeGreaterThan(0);
      for (const url of [...image.sourceProductUrls, ...image.sourceImageUrls]) {
        expect(url.startsWith("https://buildpelican.com/products/") || url.startsWith("https://cdn.shopify.com/s/files/1/0624/4476/5324/files/")).toBe(true);
      }
      expect(image.matchRules.length).toBeGreaterThan(0);
      expect(["exact-sku", "exact-product-name", "packaging-variant"]).toContain(image.matchRules[0]);
    }
  });

  it("uploads exactly the manifest keys, verified against the recorded checksums", () => {
    expect(script).toContain("product-images-manifest.json");
    expect(script).toContain("image.sha256");
    expect(script).toContain("storageUploadExact(image.storageKey");
    expect(script).toContain('"image/webp"');
    // The script must refuse a drifted file rather than upload it.
    expect(script).toMatch(/digest !== image\.sha256[\s\S]*Refusing to upload/);
  });
});
