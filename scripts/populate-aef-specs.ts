import { eq, and, ne } from "drizzle-orm";
import { getDb } from "../server/db";
import { distributors, doorStyles } from "../drizzle/schema";
import { aefFramelessSpec } from "../shared/aefFramelessSpecs";

const db = await getDb();
if (!db) throw new Error("Database unavailable");
const [aef] = await db.select({ id: distributors.id }).from(distributors).where(eq(distributors.code, "AEF")).limit(1);
if (!aef) throw new Error("AEF distributor not found");
const rows = await db.select({ id: doorStyles.id, styleCode: doorStyles.styleCode }).from(doorStyles).where(and(eq(doorStyles.distributorId, aef.id), ne(doorStyles.styleCode, "SCL")));
let updated = 0;
for (const row of rows) {
  const spec = aefFramelessSpec(row.styleCode);
  if (!spec) continue;
  await db.update(doorStyles).set(spec).where(eq(doorStyles.id, row.id));
  updated += 1;
}
console.log(JSON.stringify({ distributor: "AEF", updated, excluded: "SCL", pricesChanged: false, publicationFlagsChanged: false }));
process.exit(0);
