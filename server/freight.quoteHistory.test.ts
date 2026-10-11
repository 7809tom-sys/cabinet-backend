import { describe, expect, it, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { logFreightApiCall } from "./_core/freightApiLog";

const MARK = "99999";

describe("freight quote history is permanent and carries pallet details", () => {
  afterAll(async () => {
    const db: any = await getDb();
    if (db) await db.execute(sql`delete from freight_quote_history where fromZip = ${MARK}`);
  });
  it("stores a failed and a successful quote with pallet dimensions", async () => {
    logFreightApiCall({
      broker: "worldwideexpress", fromZip: MARK, toZip: "53186", palletCount: 1, totalWeightLbs: 977,
      freightClass: "75", accessorials: ["RESIDENTIAL", "LIFTGATE"], ok: false, amountCents: 0,
      error: "503", durationMs: 12,
      packages: [{ kind: "pallet", index: 1, lengthIn: 96, widthIn: 40, heightIn: 60, weightLbs: 977 }],
    });
    logFreightApiCall({
      broker: "ups", fromZip: MARK, toZip: "53186", palletCount: 0, totalWeightLbs: 25,
      freightClass: "Parcel", accessorials: [], ok: true, amountCents: 4321, carrier: "UPS", service: "Ground",
      durationMs: 9, packages: [{ kind: "carton", index: 1, lengthIn: 22, widthIn: 15, heightIn: 9, weightLbs: 25 }],
    });
    await new Promise((r) => setTimeout(r, 800));
    const db: any = await getDb();
    const [rows]: any = await db.execute(sql`select * from freight_quote_history where fromZip = ${MARK} order by id`);
    expect(rows).toHaveLength(2);
    const wwex = rows.find((r: any) => r.broker === "worldwideexpress");
    const ups = rows.find((r: any) => r.broker === "ups");
    expect(wwex.ok).toBeFalsy();
    expect(JSON.parse(wwex.packagesJson)[0]).toMatchObject({ lengthIn: 96, widthIn: 40, heightIn: 60, weightLbs: 977 });
    expect(ups.amountCents).toBe(4321);
    expect(ups.carrier).toBe("UPS");
  });
});
