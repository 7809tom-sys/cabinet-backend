import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const styles = [
  { styleCode: "ASP", ourName: "Aspen",                        distributorName: "Aspen" },
  { styleCode: "CC",  ourName: "Classic Cream",                distributorName: "Classic Cream" },
  { styleCode: "CS",  ourName: "Carmel Shaker",                distributorName: "Carmel Shaker" },
  { styleCode: "DN",  ourName: "Designer Natural",             distributorName: "Designer Natural" },
  { styleCode: "FS",  ourName: "Fresh Sage",                   distributorName: "Fresh Sage" },
  { styleCode: "GV",  ourName: "Greek Villa",                  distributorName: "Greek Villa" },
  { styleCode: "HS",  ourName: "Hickory Shaker",               distributorName: "Hickory Shaker" },
  { styleCode: "MBS", ourName: "Midnight Black Shaker",        distributorName: "Midnight Black Shaker" },
  { styleCode: "NG",  ourName: "Winchester Grey (Norris Grey)",distributorName: "Winchester Grey (Norris Grey)" },
  { styleCode: "PS",  ourName: "Platinum Shaker",              distributorName: "Platinum Shaker" },
  { styleCode: "RH",  ourName: "Rustic Hickory",               distributorName: "Rustic Hickory" },
  { styleCode: "WPG", ourName: "West Point Grey",              distributorName: "West Point Grey" },
  { styleCode: "WS",  ourName: "White Shaker",                 distributorName: "White Shaker" },
];

const conn = await createConnection(process.env.DATABASE_URL);

for (const s of styles) {
  try {
    await conn.execute(
      `INSERT INTO door_styles (distributorId, styleCode, ourName, distributorName, isActive, createdAt)
       VALUES (3, ?, ?, ?, 1, NOW())`,
      [s.styleCode, s.ourName, s.distributorName]
    );
    console.log(`✅ Inserted: ${s.styleCode} — ${s.ourName}`);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      console.log(`⏭  Already exists: ${s.styleCode}`);
    } else {
      console.error(`❌ Error for ${s.styleCode}:`, err.message);
    }
  }
}

await conn.end();
console.log("Done.");
