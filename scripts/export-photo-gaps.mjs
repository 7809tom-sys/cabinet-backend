// Export the per-family photo gap list (active door styles missing a real
// room-scene / door-sample photo) to a CSV the owner can fill in.
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(url);
const [rows] = await conn.execute(
  `SELECT styleCode, ourName, doorStyle, woodSpecies, finish, color,
          roomSceneImageUrl, doorSampleImageUrl, thumbnailImageUrl
     FROM door_styles
    WHERE isActive = 1
    ORDER BY ourName`,
);

const isReal = (v) => typeof v === "string" && /^https?:\/\//.test(v.trim());
const esc = (v) => {
  const s = (v ?? "").toString().replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
};

const header = [
  "styleCode",
  "ourName",
  "doorStyle",
  "woodSpecies",
  "finish",
  "color",
  "hasRoomScene",
  "hasDoorSample",
  "hasThumbnail",
  "NEEDS_PHOTO",
  "room_scene_url_TO_FILL",
  "door_sample_url_TO_FILL",
];

const lines = [header.join(",")];
let missing = 0;
for (const r of rows) {
  const room = isReal(r.roomSceneImageUrl);
  const door = isReal(r.doorSampleImageUrl);
  const thumb = isReal(r.thumbnailImageUrl);
  const needs = !room || !door;
  if (needs) missing++;
  lines.push(
    [
      esc(r.styleCode),
      esc(r.ourName),
      esc(r.doorStyle),
      esc(r.woodSpecies),
      esc(r.finish),
      esc(r.color),
      room ? "YES" : "no",
      door ? "YES" : "no",
      thumb ? "YES" : "no",
      needs ? "YES" : "",
      "",
      "",
    ].join(","),
  );
}

const fs = await import("node:fs");
const out = "/home/ubuntu/cabinet-dealz/photo-gap-list.csv";
fs.writeFileSync(out, lines.join("\n") + "\n", "utf8");
console.log(`Wrote ${rows.length} families (${missing} need photos) -> ${out}`);
await conn.end();
