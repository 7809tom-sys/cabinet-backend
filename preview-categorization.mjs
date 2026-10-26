import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "cabinet_dealz",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function previewCategorization() {
  const conn = await pool.getConnection();

  try {
    // Fetch all cabinets
    const [cabinets] = await conn.query("SELECT id, masterCode, description, category FROM cabinets ORDER BY masterCode");

    console.log("\n📊 CATEGORIZATION PREVIEW\n");
    console.log(`Total items: ${cabinets.length}\n`);

    const changes = {
      wall: [],
      base: [],
      accessory: [],
      noChange: [],
    };

    for (const cabinet of cabinets) {
      const code = (cabinet.masterCode || "").toUpperCase();
      let newCategory = "Accessory";

      if (code.startsWith("W")) {
        newCategory = "Wall";
      } else if (code.startsWith("B")) {
        newCategory = "Base";
      }

      const currentCategory = cabinet.category || "Unknown";
      const isChange = currentCategory !== newCategory;

      const item = {
        id: cabinet.id,
        code: cabinet.masterCode,
        description: cabinet.description,
        current: currentCategory,
        new: newCategory,
      };

      if (isChange) {
        if (newCategory === "Wall") changes.wall.push(item);
        else if (newCategory === "Base") changes.base.push(item);
        else changes.accessory.push(item);
      } else {
        changes.noChange.push(item);
      }
    }

    // Summary
    console.log("📋 SUMMARY OF CHANGES:\n");
    console.log(`✓ Moving to WALL:      ${changes.wall.length} items`);
    console.log(`✓ Moving to BASE:      ${changes.base.length} items`);
    console.log(`✓ Moving to ACCESSORY: ${changes.accessory.length} items`);
    console.log(`✓ No change:           ${changes.noChange.length} items\n`);

    // Show samples of each category
    if (changes.wall.length > 0) {
      console.log("📌 WALL CABINETS (sample):");
      changes.wall.slice(0, 5).forEach((item) => {
        console.log(`   ${item.code}: "${item.description}" (${item.current} → ${item.new})`);
      });
      if (changes.wall.length > 5) console.log(`   ... and ${changes.wall.length - 5} more\n`);
      else console.log();
    }

    if (changes.base.length > 0) {
      console.log("📌 BASE CABINETS (sample):");
      changes.base.slice(0, 5).forEach((item) => {
        console.log(`   ${item.code}: "${item.description}" (${item.current} → ${item.new})`);
      });
      if (changes.base.length > 5) console.log(`   ... and ${changes.base.length - 5} more\n`);
      else console.log();
    }

    if (changes.accessory.length > 0) {
      console.log("📌 ACCESSORIES (sample):");
      changes.accessory.slice(0, 5).forEach((item) => {
        console.log(`   ${item.code}: "${item.description}" (${item.current} → ${item.new})`);
      });
      if (changes.accessory.length > 5) console.log(`   ... and ${changes.accessory.length - 5} more\n`);
      else console.log();
    }

    console.log("✅ Preview complete. Ready to apply? Run: node apply-categorization.mjs\n");
  } finally {
    await conn.release();
    await pool.end();
  }
}

previewCategorization().catch(console.error);
