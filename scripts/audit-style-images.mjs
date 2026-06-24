import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(url);
const [rows] = await conn.execute(
  `SELECT id, ourName, color, doorStyle, doorSampleImageUrl, roomSceneImageUrl, thumbnailImageUrl, isActive, isFeatured
   FROM door_styles ORDER BY id`
);
await conn.end();

const out = rows.map((r) => ({
  id: r.id,
  name: r.ourName,
  color: r.color,
  doorStyle: r.doorStyle,
  swatch: r.doorSampleImageUrl ? "yes" : "MISSING",
  scene: r.roomSceneImageUrl ? "yes" : "MISSING",
  thumb: r.thumbnailImageUrl ? "yes" : "MISSING",
  sceneUrl: r.roomSceneImageUrl || "",
  active: r.isActive,
  featured: r.isFeatured,
}));

const missingScene = out.filter((o) => o.scene === "MISSING");
const missingSwatch = out.filter((o) => o.swatch === "MISSING");

console.log("TOTAL:", out.length);
console.log("MISSING SCENE:", missingScene.length);
console.log("MISSING SWATCH:", missingSwatch.length);
console.log("\n=== ALL STYLES ===");
for (const o of out) {
  console.log(
    `${o.id}\t${o.active ? "A" : "-"}${o.featured ? "F" : "-"}\tsw:${o.swatch}\tsc:${o.scene}\t${o.name} (${o.color || "?"} / ${o.doorStyle || "?"})`
  );
}

// Detect scene reuse: same sceneUrl across different color families.
const byScene = new Map();
for (const o of out) {
  if (!o.sceneUrl) continue;
  if (!byScene.has(o.sceneUrl)) byScene.set(o.sceneUrl, []);
  byScene.get(o.sceneUrl).push(o);
}
console.log("\n=== SHARED SCENE URLS (reused across styles) ===");
for (const [u, list] of byScene) {
  if (list.length > 1) {
    console.log(`${list.length}x  ${u.slice(0, 60)}  ->  ${list.map((x) => x.name).join(", ")}`);
  }
}
