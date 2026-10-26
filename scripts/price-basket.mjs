import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const conn = await mysql.createConnection(url);

// Representative basket: most common cabinet sizes a homeowner would actually buy.
// We resolve by category + width so we don't depend on exact master codes.
const picks = [
  ["Base", "Single Door Base", null],
  ["Base", "Drawer Base", null],
  ["Base", "Sink Base", null],
  ["Wall", "Single Door Wall", null],
  ["Wall", "Double Door Wall", null],
  ["Tall", null, null],
  ["Vanity", null, null],
];

async function rows(sql, params) {
  const [r] = await conn.query(sql, params);
  return r;
}

// 1) Per-category-subcategory price summary across all door styles/distributors.
console.log("=== Category/subcategory homeowner price summary (all styles) ===");
const summary = await rows(
  `SELECT c.category, COALESCE(c.subCategory,'(none)') AS subCategory,
          COUNT(*) AS n,
          ROUND(MIN(s.homeownerPrice)) AS home_min,
          ROUND(AVG(s.homeownerPrice)) AS home_avg,
          ROUND(MAX(s.homeownerPrice)) AS home_max,
          ROUND(MIN(s.yourCost)) AS cost_floor_min,
          ROUND(AVG(s.yourCost)) AS cost_avg
   FROM cabinets c
   JOIN distributor_skus s ON s.cabinetId=c.id
   WHERE c.isActive=1 AND s.homeownerPrice IS NOT NULL AND s.isAvailable=1
   GROUP BY c.category, c.subCategory
   HAVING n >= 3
   ORDER BY c.category, home_avg DESC`,
  []
);
for (const r of summary) {
  console.log(
    `${r.category} / ${r.subCategory} | n=${r.n} | home $${r.home_min}-${r.home_avg}-${r.home_max} | costFloor $${r.cost_floor_min} (avg $${r.cost_avg})`
  );
}

// 2) Specific popular widths for the comparison basket (resolve by category + width).
console.log("\n=== Representative basket by category + width (homeowner avg) ===");
const basket = [
  ["Base", "Single Door Base", [12, 15, 18, 21, 24]],
  ["Base", "Drawer Base", [12, 15, 18, 24, 30]],
  ["Base", "Sink Base", [30, 33, 36]],
  ["Wall", "Single Door Wall", [12, 15, 18, 21]],
  ["Wall", "Double Door Wall", [24, 27, 30, 36]],
];
for (const [cat, sub, widths] of basket) {
  for (const w of widths) {
    const r = await rows(
      `SELECT c.masterCode, ROUND(AVG(s.homeownerPrice)) AS home_avg,
              ROUND(MIN(s.homeownerPrice)) AS home_min, ROUND(MAX(s.homeownerPrice)) AS home_max,
              ROUND(MIN(s.yourCost)) AS cost_floor, COUNT(*) AS n
       FROM cabinets c JOIN distributor_skus s ON s.cabinetId=c.id
       WHERE c.isActive=1 AND s.homeownerPrice IS NOT NULL AND s.isAvailable=1
         AND c.category=? AND c.subCategory=? AND ROUND(c.width)=?
       GROUP BY c.masterCode
       ORDER BY n DESC LIMIT 1`,
      [cat, sub, w]
    );
    if (r.length) {
      const x = r[0];
      console.log(
        `${cat} ${sub} ${w}" -> ${x.masterCode} | home $${x.home_min}-${x.home_avg}-${x.home_max} | costFloor $${x.cost_floor} | n=${x.n}`
      );
    } else {
      console.log(`${cat} ${sub} ${w}" -> (no SKU)`);
    }
  }
}

// 3) Tall pantry + vanity sink base sample.
console.log("\n=== Tall + Vanity sample ===");
const tv = await rows(
  `SELECT c.masterCode, c.category, ROUND(c.width) AS w, ROUND(c.height) AS h,
          ROUND(AVG(s.homeownerPrice)) AS home_avg, ROUND(MIN(s.yourCost)) AS cost_floor, COUNT(*) AS n
   FROM cabinets c JOIN distributor_skus s ON s.cabinetId=c.id
   WHERE c.isActive=1 AND s.homeownerPrice IS NOT NULL AND s.isAvailable=1
     AND c.category IN ('Tall','Vanity')
   GROUP BY c.masterCode, c.category, c.width, c.height
   ORDER BY c.category, home_avg DESC LIMIT 16`,
  []
);
for (const r of tv) {
  console.log(`${r.category} ${r.masterCode} ${r.w}x${r.h} | home $${r.home_avg} | costFloor $${r.cost_floor} | n=${r.n}`);
}

await conn.end();
