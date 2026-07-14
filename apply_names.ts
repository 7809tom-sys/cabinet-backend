import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { distributors, doorStyles } from "./drizzle/schema";
import { eq, and } from "drizzle-orm";

// White-label name mapping table from the user
// [distributorBrandName, styleCode, distributorName, ourName]
const MAPPING: Array<[string, string, string, string]> = [
  // Clark And Son
  ["Clark And Son", "ASP", "Aspen White",             "Lumina White"],
  ["Clark And Son", "CC",  "Classic Cream",            "Aura Cream"],
  ["Clark And Son", "CS",  "Carmel Shaker",            "Terra Shaker"],
  ["Clark And Son", "RH",  "Rustic Hickory",           "Forest Rust"],
  ["Clark And Son", "DN",  "Designer Natural",         "Natura Maple"],
  ["Clark And Son", "GV",  "Greek Villa",              "Villa Blanc"],
  ["Clark And Son", "FS",  "Fresh Sage",               "Zenith Sage"],
  ["Clark And Son", "HS",  "Hickory Shaker",           "Silva Shaker"],
  ["Clark And Son", "MBS", "Midnight Black Shaker",    "Onyx Shadow"],
  ["Clark And Son", "NG",  "Winchester Grey",          "Slate Echo"],
  ["Clark And Son", "PS",  "Platinum Shaker",          "Sterling Pulse"],
  ["Clark And Son", "WPG", "West Point Grey",          "Nimbus Grey"],
  ["Clark And Son", "WS",  "White Shaker",             "Nova White"],
  // Skyline
  ["Skyline Cabinetry", "SW",  "Shaker White",         "Blanc Core"],
  ["Skyline Cabinetry", "GR",  "Shaker Gray",          "Cinder Core"],
  ["Skyline Cabinetry", "SE",  "Shaker Expresso",      "Umbra Shaker"],
  ["Skyline Cabinetry", "NB",  "Navy Blue",            "Cobalt Abyss"],
  ["Skyline Cabinetry", "AG",  "Aston Green",          "Virid Echo"],
  ["Skyline Cabinetry", "IB",  "Iron Black",           "Obsidian Forge"],
  ["Skyline Cabinetry", "SA",  "Smokey Ash",           "Vesper Ash"],
  ["Skyline Cabinetry", "LG",  "Lunar Gray",           "Selene Gray"],
  ["Skyline Cabinetry", "SB",  "Sage Breeze",          "Zephyr Sage"],
  ["Skyline Cabinetry", "TC",  "Treasure Chest",       "Aurum Vault"],
  ["Skyline Cabinetry", "RW",  "Rustic Wood",          "Sylvan Rust"],
  ["Skyline Cabinetry", "AW",  "Aspen White",          "Lumina Blanc"],
  ["Skyline Cabinetry", "AC",  "Aspen Charcoal",       "Carbon Frost"],
  ["Skyline Cabinetry", "DSG", "Double Smokey Gray",   "Dual Vesper"],
  ["Skyline Cabinetry", "DDW", "Double Dove White",    "Dual Blanc"],
  ["Skyline Cabinetry", "CW",  "Charleston White",     "Haven White"],
  ["Skyline Cabinetry", "SDW", "Slim Dove White",      "Aero Blanc"],
  ["Skyline Cabinetry", "SAG", "Slim Aston Green",     "Aero Sage"],
  ["Skyline Cabinetry", "SIB", "Slim Iron Black",      "Aero Obsidian"],
  ["Skyline Cabinetry", "SAO", "Slim Amber Oak",       "Aero Solstice"],
  ["Skyline Cabinetry", "SWO", "Slim White Oak",       "Air Dawn"],
  ["Skyline Cabinetry", "HW",  "High Glossy White",    "Glace Blanc"],
  ["Skyline Cabinetry", "HG",  "High Glossy Gray",     "Glace Cinder"],
  ["Skyline Cabinetry", "MB",  "Matte Black",          "Vellum Noir"],
  ["Skyline Cabinetry", "MI",  "Matte Ivory",          "Vellum Crema"],
  ["Skyline Cabinetry", "OB",  "Oak Blonde",           "Solis Oak"],
  ["Skyline Cabinetry", "OS",  "Oak Shade",            "Umbra Oak"],
  ["Skyline Cabinetry", "CG",  "Crystal Glass",        "Prism Clear"],
  ["Skyline Cabinetry", "MG",  "Midnight Glass",       "Nocturne Glass"],
  ["Skyline Cabinetry", "FW",  "Floral White",         "Bloom Blanc"],
  ["Skyline Cabinetry", "FG",  "Floral Gray",          "Bloom Cinder"],
  ["Skyline Cabinetry", "FE",  "Floral Expresso",      "Bloom Umbra"],
  // US Cabinet Depot
  ["US Cabinet Depot", "SA",  "Shaker Antique White",  "Aura Blanc"],
  ["US Cabinet Depot", "SD",  "Shaker Dove",           "Nimbus Blanc"],
  ["US Cabinet Depot", "SG",  "Shaker Grey",           "Slate Core"],
  ["US Cabinet Depot", "SW",  "Shaker White",          "Nova White"],
  ["US Cabinet Depot", "SI",  "Shaker Ivy",            "Ivy Core"],
  ["US Cabinet Depot", "SN",  "Shaker Navy",           "Navy Core"],
  ["US Cabinet Depot", "SB",  "Shaker Black",          "Onyx Core"],
  ["US Cabinet Depot", "SH",  "Shaker Honey",          "Honey Core"],
  ["US Cabinet Depot", "SC",  "Shaker Cinder",         "Cinder Core"],
  ["US Cabinet Depot", "EW",  "Edgeline White",        "Edge Blanc"],
  ["US Cabinet Depot", "OW",  "Oxford White",          "Oxford Blanc"],
  ["US Cabinet Depot", "OS",  "Oxford Sage",           "Sage Haven"],
  ["US Cabinet Depot", "CW",  "Casselberry Antique White", "Casselberry Blanc"],
  ["US Cabinet Depot", "CS",  "Casselberry Saddle",    "Walnut Haven"],
  ["US Cabinet Depot", "HD",  "Haven Dune",            "Ivory Dune"],
  ["US Cabinet Depot", "OM",  "Oxford Mist",           "Slate Gray"],
  ["US Cabinet Depot", "OT",  "Oxford Toffee",         "Warm Toffee"],
  ["US Cabinet Depot", "HE",  "Haven Ember",           "Warm Mocha"],
  ["US Cabinet Depot", "SEO", "Shaker Essence Oak",    "Rift Oak"],
  ["US Cabinet Depot", "SU",  "Shaker Unfinished",     "Natural Maple"],
  ["US Cabinet Depot", "OC",  "Oxford Cashmere",       "Warm Cashmere"],
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);
  const db = drizzle(conn);

  // Build brand → distributor ID map
  const allDists = await db
    .select({ id: distributors.id, brandName: distributors.brandName, name: distributors.name })
    .from(distributors);

  const brandToId = new Map<string, number>();
  for (const d of allDists) {
    if (d.brandName) brandToId.set(d.brandName, d.id);
    brandToId.set(d.name, d.id); // also match by neutral name
  }

  console.log("Distributor brand map:", Object.fromEntries(brandToId));

  let updated = 0;
  let notFound = 0;

  for (const [brand, styleCode, distName, ourName] of MAPPING) {
    const distId = brandToId.get(brand);
    if (!distId) {
      console.log(`  MISSING distributor: "${brand}"`);
      notFound++;
      continue;
    }

    // Find the style by distributorId + styleCode
    const existing = await db
      .select({ id: doorStyles.id, ourName: doorStyles.ourName })
      .from(doorStyles)
      .where(and(eq(doorStyles.distributorId, distId), eq(doorStyles.styleCode, styleCode)))
      .limit(1);

    if (existing.length === 0) {
      // Insert new style
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
      console.log(`  INSERT: [${brand}] ${styleCode} -> "${ourName}"`);
      updated++;
    } else if (existing[0].ourName !== ourName) {
      // Update existing
      await db
        .update(doorStyles)
        .set({ ourName, distributorName: distName })
        .where(eq(doorStyles.id, existing[0].id));
      console.log(`  UPDATE: [${brand}] ${styleCode} "${existing[0].ourName}" -> "${ourName}"`);
      updated++;
    } else {
      console.log(`  OK: [${brand}] ${styleCode} "${ourName}"`);
    }
  }

  console.log(`\nDone: ${updated} updated/inserted, ${notFound} missing distributors.`);
  await conn.end();
}
main().catch(console.error);
