import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

const ASHFORD_DIST_ID = 2;
const DISCOUNT_RATE  = 0.38;   // you pay 38% of list
const HOMEOWNER_MUL  = 1.68;
const CONTRACTOR_MUL = 1.29;
const WHOLESALE_MUL  = 1.25;

// The pricing fix ran twice, causing double-division of listPrice.
// Current state:  listPrice = originalCost / 0.38 / 0.38,  yourCost = originalCost / 0.38
// We need:        listPrice = originalCost / 0.38,          yourCost = originalCost
//
// To recover: originalCost = yourCost * 0.38  (reverse the first division)
// Then apply the correct chain once.

console.log('=== Ashford Pricing Reset + Fix ===');
console.log('Recovering original cost = current yourCost × 0.38, then applying correct chain.\n');

// Sample before reset
const [before] = await db.query(
  'SELECT platformSku, listPrice, yourCost, homeownerPrice FROM distributor_skus WHERE distributorId = ? LIMIT 3',
  [ASHFORD_DIST_ID]
);
console.log('CURRENT (broken — double-divided):');
for (const r of before) {
  console.log(`  ${r.platformSku}: list=$${r.listPrice}, cost=$${r.yourCost}, homeowner=$${r.homeownerPrice}`);
}

// Single UPDATE that recovers original cost and applies correct chain:
//   originalCost = yourCost * 0.38   (undo the first division that set yourCost = listPrice/0.38)
//   listPrice    = originalCost / 0.38  = yourCost * 0.38 / 0.38 = yourCost  (= original cost / 0.38)
//   yourCost     = originalCost         = current yourCost * 0.38
//   tier prices  = originalCost × markup
//
// Simplified: 
//   new yourCost = current yourCost * 0.38
//   new listPrice = current yourCost  (= new yourCost / 0.38)
//   tier prices = new yourCost × markup

const [res] = await db.query(`
  UPDATE distributor_skus
  SET
    listPrice       = yourCost,
    yourCost        = ROUND(yourCost * ?, 2),
    homeownerPrice  = ROUND(yourCost * ? * ?, 2),
    contractorPrice = ROUND(yourCost * ? * ?, 2),
    wholesalePrice  = ROUND(yourCost * ? * ?, 2)
  WHERE distributorId = ? AND yourCost IS NOT NULL
`, [
  DISCOUNT_RATE,                          // new yourCost = old yourCost * 0.38
  DISCOUNT_RATE, HOMEOWNER_MUL,           // homeowner = old yourCost * 0.38 * 1.68
  DISCOUNT_RATE, CONTRACTOR_MUL,          // contractor = old yourCost * 0.38 * 1.29
  DISCOUNT_RATE, WHOLESALE_MUL,           // wholesale = old yourCost * 0.38 * 1.25
  ASHFORD_DIST_ID
]);

console.log(`\nReset and fixed ${res.affectedRows} Ashford SKUs`);

// Sample after
const [after] = await db.query(
  'SELECT platformSku, listPrice, yourCost, homeownerPrice, contractorPrice, wholesalePrice FROM distributor_skus WHERE distributorId = ? LIMIT 5',
  [ASHFORD_DIST_ID]
);
console.log('\nAFTER (correct):');
for (const r of after) {
  console.log(`  ${r.platformSku}: list=$${r.listPrice} | cost=$${r.yourCost} | homeowner=$${r.homeownerPrice} | contractor=$${r.contractorPrice} | wholesale=$${r.wholesalePrice}`);
}

// Verify against known original: GV-B12 original cost = $156.95
// Expected: list=$413.03, cost=$156.95, homeowner=$263.68, contractor=$202.47, wholesale=$196.19
const [[gvb12]] = await db.query(
  "SELECT listPrice, yourCost, homeownerPrice, contractorPrice, wholesalePrice FROM distributor_skus WHERE platformSku = 'CS_GV_B12'",
);
if (gvb12) {
  const origCost = 156.95;
  const expectedList = (origCost / DISCOUNT_RATE).toFixed(2);
  const expectedHomeowner = (origCost * HOMEOWNER_MUL).toFixed(2);
  console.log(`\nVerification against known original (GV-B12, original cost=$${origCost}):`);
  console.log(`  Expected list=$${expectedList} | Got=$${gvb12.listPrice} → ${Math.abs(Number(gvb12.listPrice)-Number(expectedList))<0.02?'✅':'❌'}`);
  console.log(`  Expected cost=$${origCost} | Got=$${gvb12.yourCost} → ${Math.abs(Number(gvb12.yourCost)-origCost)<0.02?'✅':'❌'}`);
  console.log(`  Expected homeowner=$${expectedHomeowner} | Got=$${gvb12.homeownerPrice} → ${Math.abs(Number(gvb12.homeownerPrice)-Number(expectedHomeowner))<0.02?'✅':'❌'}`);
}

// Summary
const [[sum]] = await db.query(
  'SELECT COUNT(*) as total, AVG(CAST(listPrice AS DECIMAL(10,2))) as avgList, AVG(CAST(yourCost AS DECIMAL(10,2))) as avgCost, AVG(CAST(homeownerPrice AS DECIMAL(10,2))) as avgHomeowner FROM distributor_skus WHERE distributorId = ?',
  [ASHFORD_DIST_ID]
);
const impliedDiscount = Number(sum.avgCost)/Number(sum.avgList);
console.log(`\nSummary: ${sum.total} SKUs | avg list=$${Number(sum.avgList).toFixed(2)} | avg cost=$${Number(sum.avgCost).toFixed(2)} | avg homeowner=$${Number(sum.avgHomeowner).toFixed(2)}`);
console.log(`Implied discount: ${(impliedDiscount*100).toFixed(1)}% (target: ${DISCOUNT_RATE*100}%)`);

await db.end();
console.log('\nDone.');
