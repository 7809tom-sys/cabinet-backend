import { getDb } from "../server/db.ts";
import { doorStyles } from "../drizzle/schema.ts";
import { writeFileSync } from "node:fs";

const db = await getDb();
if (!db) { console.error("no db"); process.exit(1); }

const rows = await db
  .select({
    id: doorStyles.id,
    styleCode: doorStyles.styleCode,
    ourName: doorStyles.ourName,
    doorStyle: doorStyles.doorStyle,
    woodSpecies: doorStyles.woodSpecies,
    finish: doorStyles.finish,
    color: doorStyles.color,
    doorPanelType: doorStyles.doorPanelType,
    isActive: doorStyles.isActive,
    doorSampleImageUrl: doorStyles.doorSampleImageUrl,
    thumbnailImageUrl: doorStyles.thumbnailImageUrl,
    roomSceneImageUrl: doorStyles.roomSceneImageUrl,
  })
  .from(doorStyles);

writeFileSync("/tmp/styles.json", JSON.stringify(rows, null, 2));
console.log("rows:", rows.length);
console.log("active:", rows.filter((r) => r.isActive).length);
console.log("with doorSample:", rows.filter((r) => r.doorSampleImageUrl).length);
console.log("sample of columns:", JSON.stringify(rows[0], null, 2));
process.exit(0);
