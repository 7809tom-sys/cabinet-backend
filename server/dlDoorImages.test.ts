import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../data/distributors/dl-cabinetry/", import.meta.url);
const sql = readFileSync(new URL("dl_door_images_tidb.sql", dir), "utf8");
const manifest = readFileSync(new URL("door-images/manifest.csv", dir), "utf8");

describe("DL door image SQL", () => {
  const styles = [
    ["DL-WS", "white_shaker_door.png", "dl-cabinetry-white-shaker-door_"],
    ["DL-SSA", "slim_shaker_alabaster_door.png", "dl-cabinetry-slim-shaker-alabaster-door_"],
    ["DL-SSE", "slim_shaker_ebony_door.png", "dl-cabinetry-slim-shaker-ebony-door_"],
  ] as const;

  it("points each style at the content-hash key of its committed original", () => {
    for (const [code, file, prefix] of styles) {
      const sha = createHash("sha256").update(readFileSync(new URL(`door-images/${file}`, dir))).digest("hex");
      const key = `${prefix}${sha.slice(0, 8)}.png`;
      expect(sql).toContain(`'/manus-storage/${key}'`);
      expect(sql).toContain(`styleCode = '${code}'`);
      expect(manifest).toContain(sha);
      expect(manifest).toContain(key);
    }
  });

  it("only updates DL (450001), one UPDATE per block, never verifies, activates or touches Luxe", () => {
    expect(sql.match(/^UPDATE cabinet_dealz\.door_styles/gm)).toHaveLength(3);
    expect(sql.match(/WHERE distributorId = 450001 AND styleCode = /g)).toHaveLength(3);
    expect(sql).not.toMatch(/SET[^;]*doorSampleVerified/);
    expect(sql).not.toMatch(/SET[^;]*isActive/);
    expect(sql).not.toMatch(/styleCode = 'DL-LUXE-TBD'\s*;/);
  });
});
