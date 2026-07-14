import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { distributors, doorStyles } from "/home/ubuntu/cabinet-dealz/drizzle/schema";
import { eq, and } from "drizzle-orm";

async function main() {
const conn = await mysql.createConnection(process.env.DATABASE_URL!);
const db = drizzle(conn);

// 1. Insert Skyline distributor (or get existing)
const existing = await db
  .select({ id: distributors.id })
  .from(distributors)
  .where(eq(distributors.code, "SKY"))
  .limit(1);

let distributorId: number;
if (existing.length > 0) {
  distributorId = existing[0].id;
  console.log("Skyline distributor already exists, id =", distributorId);
} else {
  const res = await db.insert(distributors).values({
    code: "SKY",
    name: "Skyline",
    initials: "S",
    brandName: "Skyline Cabinetry",
    brandInitials: "SKY",
    whiteLabel: false,
    displayMode: "branded",
    costMultiplier: "0.3500",
    baseMultiplier: "0.2800",
    freightMultiplier: "0.0700",
    tariffRate: "0.0000",
    shippingRate: "0.0000",
    isActive: true,
    pickupEnabled: false,
    pickupRadiusMiles: 100,
  });
  distributorId = (res[0] as any).insertId;
  console.log("Created Skyline distributor, id =", distributorId);
}

// 2. Door styles — exact codes from the Skyline price sheet
const styles: Array<[string, string, string, string, string]> = [
  ["SW",  "Shaker White",       "Shaker White",       "Shaker",       "White"],
  ["GR",  "Shaker Gray",        "Shaker Gray",        "Shaker",       "Gray"],
  ["SE",  "Shaker Espresso",    "Shaker Expresso",    "Shaker",       "Espresso"],
  ["NB",  "Navy Blue",          "Navy Blue",          "Shaker",       "Navy Blue"],
  ["AG",  "Aston Green",        "Aston Green",        "Shaker",       "Green"],
  ["IB",  "Iron Black",         "Iron Black",         "Shaker",       "Black"],
  ["SA",  "Smokey Ash",         "Smokey Ash",         "Shaker",       "Ash"],
  ["LG",  "Lunar Gray",         "Lunar Gray",         "Shaker",       "Gray"],
  ["SB",  "Sage Breeze",        "Sage Breeze",        "Shaker",       "Sage"],
  ["TC",  "Treasure Chest",     "Treasure Chest",     "Shaker",       "Brown"],
  ["RW",  "Rustic Wood",        "Rustic Wood",        "Shaker",       "Wood"],
  ["AW",  "Aspen White",        "Aspen White",        "Shaker",       "White"],
  ["AC",  "Aspen Charcoal",     "Aspen Charcoal",     "Shaker",       "Charcoal"],
  ["DSG", "Double Smokey Gray", "Double Smokey Gray", "Shaker",       "Gray"],
  ["DDW", "Double Dove White",  "Double Dove White",  "Shaker",       "White"],
  ["CW",  "Charleston White",   "Charleston White",   "Shaker",       "White"],
  ["SDW", "Slim Dove White",    "Slim Dove White",    "Slim Shaker",  "White"],
  ["SAG", "Slim Aston Green",   "Slim Aston Green",   "Slim Shaker",  "Green"],
  ["SIB", "Slim Iron Black",    "Slim Iron Black",    "Slim Shaker",  "Black"],
  ["SAO", "Slim Amber Oak",     "Slim Amber Oak",     "Slim Shaker",  "Oak"],
  ["SWO", "Slim White Oak",     "Slim White Oak",     "Slim Shaker",  "Oak"],
  ["HW",  "High Glossy White",  "High Glossy White",  "Slab",         "White"],
  ["HG",  "High Glossy Gray",   "High Glossy Gray",   "Slab",         "Gray"],
  ["MB",  "Matte Black",        "Matte Black",        "Slab",         "Black"],
  ["MI",  "Matte Ivory",        "Matte Ivory",        "Slab",         "Ivory"],
  ["OB",  "Oak Blonde",         "Oak Blonde",         "Shaker",       "Oak"],
  ["OS",  "Oak Shade",          "Oak Shade",          "Shaker",       "Oak"],
  ["CG",  "Crystal Glass",      "Crystal Glass",      "Glass",        "Clear"],
  ["MG",  "Midnight Glass",     "Midnight Glass",     "Glass",        "Dark"],
  ["FW",  "Floral White",       "Floral White",       "Floral",       "White"],
  ["FG",  "Floral Gray",        "Floral Gray",        "Floral",       "Gray"],
  ["FE",  "Floral Espresso",    "Floral Expresso",    "Floral",       "Espresso"],
];

let inserted = 0;
let skipped = 0;

for (const [styleCode, ourName, distributorName, doorStyle, color] of styles) {
  const ex = await db
    .select({ id: doorStyles.id })
    .from(doorStyles)
    .where(and(eq(doorStyles.distributorId, distributorId), eq(doorStyles.styleCode, styleCode)))
    .limit(1);

  if (ex.length > 0) {
    console.log(`  SKIP: ${ourName} (${styleCode}) already exists`);
    skipped++;
    continue;
  }

  await db.insert(doorStyles).values({
    distributorId,
    styleCode,
    ourName,
    distributorName,
    doorStyle,
    color,
    isActive: true,
    isFeatured: false,
    featuredRank: 0,
    isBuilderGrade: false,
    doorSampleVerified: false,
  });
  console.log(`  INSERT: ${ourName} (${styleCode})`);
  inserted++;
}

console.log(`\nDone: ${inserted} inserted, ${skipped} skipped.`);
await conn.end();
}
main().catch(console.error);
