import mysql from "mysql2/promise";

const u = new URL(process.env.DATABASE_URL);
const c = await mysql.createConnection({
  host: u.hostname,
  port: u.port,
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

const [ps] = await c.query("SELECT * FROM pricing_settings LIMIT 1");
console.log("== pricing_settings ==");
console.log(JSON.stringify(ps, null, 1));

// The cabinet in the screenshot: 12" single door single drawer base w/ adjustable shelf, Air Dawn / Slim Shaker
const [cabs] = await c.query(
  "SELECT id, masterCode, description FROM cabinets WHERE description LIKE '%12%Single Door%Single Drawer%' LIMIT 5"
);
console.log("== candidate cabinets ==");
console.log(JSON.stringify(cabs, null, 1));

if (cabs.length) {
  const ids = cabs.map((r) => r.id);
  const [skus] = await c.query(
    `SELECT cabinetId, styleId, distributorId, yourCost, wholesalePrice, contractorPrice, homeownerPrice, listPrice, adjustedListPrice, isPublished, isAvailable
     FROM distributor_skus WHERE cabinetId IN (${ids.join(",")}) LIMIT 20`
  );
  console.log("== skus for candidates ==");
  console.log(JSON.stringify(skus, null, 1));
}

await c.end();
