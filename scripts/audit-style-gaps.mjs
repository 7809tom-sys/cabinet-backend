import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
async function rows(sql, params = []) {
  const [r] = await conn.execute(sql, params);
  return r;
}

// Map each style to its distributor (supply line)
const styles = await rows(`
  SELECT ds.id styleId, ds.ourName, ds.distributorId,
         d.name lineName
  FROM door_styles ds
  LEFT JOIN distributors d ON d.id = ds.distributorId
`);
const styleById = new Map(styles.map((s) => [s.styleId, s]));

// All published+available SKUs joined to cabinet placement
const skus = await rows(`
  SELECT s.styleId, s.distributorId, c.masterCode, c.placementType, c.subCategory
  FROM distributor_skus s
  JOIN cabinets c ON c.id = s.cabinetId
  WHERE s.isPublished=1 AND s.isAvailable=1 AND c.isActive=1
`);

// Per line: the master set = union of all masterCodes published on ANY style of that line
const lineMaster = new Map();      // lineKey -> Set(masterCode)
const stylePublished = new Map();  // styleId -> Set(masterCode)
for (const k of skus) {
  const st = styleById.get(k.styleId);
  const lineKey = st ? (st.distributorId ?? "nodist") : (k.distributorId ?? "nodist");
  if (!lineMaster.has(lineKey)) lineMaster.set(lineKey, new Set());
  lineMaster.get(lineKey).add(k.masterCode);
  if (!stylePublished.has(k.styleId)) stylePublished.set(k.styleId, new Set());
  stylePublished.get(k.styleId).add(k.masterCode);
}

console.log("=== LINE MASTER SET SIZES ===");
for (const [line, set] of lineMaster) console.log(`line ${line}: ${set.size} distinct cabinets`);

console.log("\n=== PER-STYLE GAP (missing vs its line master) ===");
let totalGap = 0;
const gapByStyle = [];
for (const s of styles) {
  const lineKey = s.distributorId ?? "nodist";
  const master = lineMaster.get(lineKey);
  if (!master) continue;
  const have = stylePublished.get(s.styleId) ?? new Set();
  const missing = [...master].filter((mc) => !have.has(mc));
  totalGap += missing.length;
  gapByStyle.push({ styleId: s.styleId, name: s.ourName, line: s.lineName, have: have.size, master: master.size, missing: missing.length });
}
gapByStyle.sort((a, b) => b.missing - a.missing);
for (const g of gapByStyle) console.log(JSON.stringify(g));
console.log("\nTOTAL missing style*cabinet combinations to backfill: " + totalGap);
console.log("Active styles: " + styles.length);

await conn.end();
