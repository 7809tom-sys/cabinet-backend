import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

const ASHFORD_DIST_ID = 2;

// Full pricing chain for Clark & Son:
//   The imported "Special Price" is your cost (e.g. $38).
//   There is no published list price — we back-calculate it from your discount rate.
//   Discount rate: you pay 38% of list → list = your cost / 0.38
//
//   listPrice       = importedSpecialPrice / 0.38   (retail list, stored for future recalcs)
//   yourCost        = listPrice × 0.38              (= importedSpecialPrice, your actual cost)
//   homeownerPrice  = yourCost × 1.68               (68% markup per Margin tab)
//   contractorPrice = yourCost × 1.29               (29% markup)
//   wholesalePrice  = yourCost × 1.25               (25% markup)
//
// Example: imported $38 → list=$100.00, cost=$38.00, homeowner=$63.84, contractor=$49.02, wholesale=$47.50

const DISCOUNT_RATE  = 0.38;   // you pay 38% of list
const HOMEOWNER_MUL  = 1.68;
const CONTRACTOR_MUL = 1.29;
const WHOLESALE_MUL  = 1.25;

console.log('=== Ashford Pricing Fix (Full Chain) ===');
console.log(`Discount rate: ${DISCOUNT_RATE} | Example: $38 cost → list=$${(38/DISCOUNT_RATE).toFixed(2)}, homeowner=$${(38*HOMEOWNER_MUL).toFixed(2)}\n`);

// Sample before
const [before] = await db.query(
  'SELECT platformSku, listPrice, yourCost, homeownerPrice FROM distributor_skus WHERE distributorId = ? LIMIT 3',
  [ASHFORD_DIST_ID]
);
console.log('BEFORE:');
for (const r of before) {
  console.log(`  ${r.platformSku}: listPrice=$${r.listPrice}, yourCost=$${r.yourCost}, homeowner=$${r.homeownerPrice}`);
}

// The current listPrice column holds the imported special price (= your cost).
// We need to:
//   1. Back-calculate the retail list: new listPrice = current listPrice / 0.38
//   2. Set yourCost = new listPrice × 0.38  (= original imported price, preserved exactly)
//   3. Calculate tier prices from yourCost
//
// MySQL executes SET clauses left-to-right using the ORIGINAL column values,
// so we capture the original listPrice in a variable first.
const [res] = await db.query(`
  UPDATE distributor_skus
  SET
    yourCost        = listPrice,
    listPrice       = ROUND(listPrice / ?, 2),
    homeownerPrice  = ROUND(listPrice * ?, 2),
    contractorPrice = ROUND(listPrice * ?, 2),
    wholesalePrice  = ROUND(listPrice * ?, 2)
  WHERE distributorId = ? AND listPrice IS NOT NULL
`, [DISCOUNT_RATE, HOMEOWNER_MUL, CONTRACTOR_MUL, WHOLESALE_MUL, ASHFORD_DIST_ID]);

console.log(`\nUpdated ${res.affectedRows} Ashford SKUs`);

// Sample after
const [after] = await db.query(
  'SELECT platformSku, listPrice, yourCost, homeownerPrice, contractorPrice, wholesalePrice FROM distributor_skus WHERE distributorId = ? LIMIT 5',
  [ASHFORD_DIST_ID]
);
console.log('\nAFTER:');
for (const r of after) {
  console.log(`  ${r.platformSku}: list=$${r.listPrice} | cost=$${r.yourCost} | homeowner=$${r.homeownerPrice} | contractor=$${r.contractorPrice} | wholesale=$${r.wholesalePrice}`);
}

// Math verification
const [[v]] = await db.query(
  'SELECT listPrice, yourCost, homeownerPrice, contractorPrice, wholesalePrice FROM distributor_skus WHERE distributorId = ? AND listPrice IS NOT NULL LIMIT 1',
  [ASHFORD_DIST_ID]
);
const list = Number(v.listPrice);
const cost = Number(v.yourCost);
const expectedCost = list * DISCOUNT_RATE;
const expectedHomeowner = cost * HOMEOWNER_MUL;
const costOk = Math.abs(cost - expectedCost) < 0.02;
const homeOwnerOk = Math.abs(Number(v.homeownerPrice) - expectedHomeowner) < 0.02;
console.log(`\nMath check on ${v.listPrice ? 'first SKU' : 'N/A'}:`);
console.log(`  list=$${list.toFixed(2)} × ${DISCOUNT_RATE} = $${expectedCost.toFixed(2)} | stored cost=$${cost.toFixed(2)} → ${costOk ? '✅' : '❌'}`);
console.log(`  cost=$${cost.toFixed(2)} × ${HOMEOWNER_MUL} = $${expectedHomeowner.toFixed(2)} | stored homeowner=$${v.homeownerPrice} → ${homeOwnerOk ? '✅' : '❌'}`);

// Summary
const [[sum]] = await db.query(
  'SELECT COUNT(*) as total, SUM(homeownerPrice IS NULL) as missing, AVG(CAST(listPrice AS DECIMAL(10,2))) as avgList, AVG(CAST(yourCost AS DECIMAL(10,2))) as avgCost FROM distributor_skus WHERE distributorId = ?',
  [ASHFORD_DIST_ID]
);
console.log(`\nTotal Ashford SKUs: ${sum.total} | Missing homeowner price: ${sum.missing}`);
console.log(`Avg list price: $${Number(sum.avgList).toFixed(2)} | Avg your cost: $${Number(sum.avgCost).toFixed(2)}`);
console.log(`Implied discount: ${(Number(sum.avgCost)/Number(sum.avgList)*100).toFixed(1)}% (target: ${DISCOUNT_RATE*100}%)`);

await db.end();
console.log('\nDone.');
