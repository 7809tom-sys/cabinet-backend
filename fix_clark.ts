import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { distributors, doorStyles } from "./drizzle/schema";
import { eq, and } from "drizzle-orm";

// Clark & Son styles — brand stored as "Clark & Son" in DB
const CLARK_STYLES: Array<[string, string, string]> = [
  ["ASP", "Aspen White",             "Lumina White"],
  ["CC",  "Classic Cream",            "Aura Cream"],
  ["CS",  "Carmel Shaker",            "Terra Shaker"],
  ["RH",  "Rustic Hickory",           "Forest Rust"],
  ["DN",  "Designer Natural",         "Natura Maple"],
  ["GV",  "Greek Villa",              "Villa Blanc"],
  ["FS",  "Fresh Sage",               "Zenith Sage"],
  ["HS",  "Hickory Shaker",           "Silva Shaker"],
  ["MBS", "Midnight Black Shaker",    "Onyx Shadow"],
  ["NG",  "Winchester Grey",          "Slate Echo"],
  ["PS",  "Platinum Shaker",          "Sterling Pulse"],
  ["WPG", "West Point Grey",          "Nimbus Grey"],
  ["WS",  "White Shaker",             "Nova White"],
  // Extra styles from user
  ["SU",  "Shaker Unfinished",        "Natural Maple"],
  ["OC",  "Oxford Cashmere",          "Warm Cashmere"],
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);
  const db = drizzle(conn);

  // Find Clark & Son distributor by brand name
  const dists = await db
    .select({ id: distributors.id, brandName: distributors.brandName })
    .from(distributors)
    .where(eq(distributors.brandName, "Clark & Son"))
    .limit(1);

  if (dists.length === 0) {
    console.error("Clark & Son distributor not found!");
    await conn.end();
    return;
  }
  const distId = dists[0].id;
  console.log("Clark & Son distributor id =", distId);

  let updated = 0;
  for (const [styleCode, distName, ourName] of CLARK_STYLES) {
    const existing = await db
      .select({ id: doorStyles.id, ourName: doorStyles.ourName })
      .from(doorStyles)
      .where(and(eq(doorStyles.distributorId, distId), eq(doorStyles.styleCode, styleCode)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(doorStyles).values({
        distributorId: distId,
        styleCode,
        ourName,
        distributorName: distName,
        isActive: true,
        isFeatured: false,
        featuredRank: 0,
        isBuilderGrade: false,
        doorSampleVerified: false,
      });
      console.log(`  INSERT: ${styleCode} -> "${ourName}"`);
      updated++;
    } else if (existing[0].ourName !== ourName) {
      await db
        .update(doorStyles)
        .set({ ourName, distributorName: distName })
        .where(eq(doorStyles.id, existing[0].id));
      console.log(`  UPDATE: ${styleCode} "${existing[0].ourName}" -> "${ourName}"`);
      updated++;
    } else {
      console.log(`  OK: ${styleCode} "${ourName}"`);
    }
  }

  console.log(`\nDone: ${updated} updated/inserted.`);
  await conn.end();
}
main().catch(console.error);
