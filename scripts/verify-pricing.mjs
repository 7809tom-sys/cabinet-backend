import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

async function q(sql) {
  const [r] = await conn.query(sql);
  return r;
}

const [agg] = await q(
  `SELECT COUNT(*) total,
          SUM(homeownerPrice < yourCost*1.7) below_floor,
          SUM(homeownerPrice < yourCost) below_cost,
          SUM(adjustedListPrice IS NOT NULL AND adjustedListPrice > homeownerPrice) has_compare_at,
          ROUND(AVG((homeownerPrice-yourCost)/homeownerPrice*100),1) avg_margin_pct,
          ROUND(MIN((homeownerPrice-yourCost)/homeownerPrice*100),1) min_margin_pct
   FROM distributor_skus WHERE homeownerPrice IS NOT NULL AND yourCost IS NOT NULL`
);
console.log("=== Post-apply verification (all priced SKUs) ===");
console.log(agg);

console.log("\n=== Basket spot-check (avg new homeowner vs old backup) ===");
const basket = await q(
  `SELECT c.masterCode,
          ROUND(AVG(s.homeownerPrice)) new_home,
          ROUND(AVG(b.old_homeowner)) old_home,
          ROUND(AVG(s.adjustedListPrice)) compare_at,
          ROUND(MIN((s.homeownerPrice-s.yourCost)/s.homeownerPrice*100)) min_margin
   FROM distributor_skus s
   JOIN cabinets c ON c.id=s.cabinetId
   LEFT JOIN homeowner_price_backup b ON b.id=s.id
   WHERE c.masterCode IN ('B-12','B-18','SB-30','SB-36','W-30-30','U-24-84','U-24-90','DB-24-2','B-24','BEC-24')
   GROUP BY c.masterCode ORDER BY c.masterCode`
).catch(() => []);
for (const r of basket) {
  console.log(
    `${r.masterCode.padEnd(10)} new $${r.new_home}  (compareAt $${r.compare_at})  min-margin ${r.min_margin}%`
  );
}

await conn.end();
