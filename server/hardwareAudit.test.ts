// Read-only audit: full door-style list w/ hardware, doorStyle type, names, images.
import { describe, it, expect } from "vitest";
import { getDb } from "./db";
import { sql } from "drizzle-orm";

describe("door style full audit", () => {
  it("dumps every door style with hardware + images", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    if (!db) return;

    const res = (await db.execute(
      sql.raw(
        `SELECT d.id AS did, d.name AS line, d.brandName AS brand,
                ds.id, ds.styleCode, ds.ourName, ds.aliasName, ds.distributorName,
                ds.doorStyle, ds.hardware,
                ds.doorSampleImageUrl, ds.doorSampleVerified
           FROM door_styles ds
           JOIN distributors d ON d.id = ds.distributorId
          ORDER BY d.id, ds.doorStyle, ds.distributorName`
      )
    )) as any;
    const rows = res[0] as any[];

    for (const r of rows) {
      const img = (r.doorSampleImageUrl ?? "").split("/").pop() ?? "(none)";
      // eslint-disable-next-line no-console
      console.log(
        `[${r.did}:${r.brand ?? r.line}] id=${r.id} code=${r.styleCode} | our="${r.ourName}" alias="${r.aliasName ?? ""}" dist="${r.distributorName}" | door=${r.doorStyle} | hw=${r.hardware} | img=${img} ver=${r.doorSampleVerified}`
      );
    }
    // eslint-disable-next-line no-console
    console.log(`\nTOTAL ${rows.length}`);
    expect(rows.length).toBeGreaterThan(0);
  }, 30000);
});
