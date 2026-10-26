import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

const MADISON_DIST_ID = 1;
// USCD: imported price = your cost. Discount rate = 0.30 (you pay 30% of list).
// listPrice = importedCost / 0.30
// yourCost  = importedCost
// tier prices = yourCost × markup
const DISCOUNT_RATE  = 0.30;
const HOMEOWNER_MUL  = 1.68;
const CONTRACTOR_MUL = 1.29;
const WHOLESALE_MUL  = 1.25;

console.log('=== Madison (USCD) Pricing Fix ===');
console.log(`Discount rate: ${DISCOUNT_RATE} | Example: $100 cost → list=$${(100/DISCOUNT_RATE).toFixed(2)}, homeowner=$${(100*HOMEOWNER_MUL).toFixed(2)}\n`);

// Check state
const [[state]] = await db.query(`
  SELECT 
    COUNT(*) as total,
    SUM(yourCost IS NULL AND listPrice IS NOT NULL) as needsFix,
    SUM(yourCost IS NOT NULL AND homeownerPrice IS NOT NULL) as alreadyOk
  FROM distributor_skus WHERE distributorId = ?
`, [MADISON_DIST_ID]);
console.log(`Total: ${state.total} | Needs fix (yourCost=null): ${state.needsFix} | Already OK: ${state.alreadyOk}`);

// Sample before
const [before] = await db.query(
  'SELECT platformSku, listPrice, yourCost, homeownerPrice FROM distributor_skus WHERE distributorId = ? AND yourCost IS NULL LIMIT 3',
  [MADISON_DIST_ID]
);
if (before.length > 0) {
  console.log('\nSample BEFORE (needs fix):');
  for (const r of before) console.log(`  ${r.platformSku}: list=$${r.listPrice}, cost=$${r.yourCost}, homeowner=$${r.homeownerPrice}`);
}

// Fix only rows where yourCost IS NULL (recently imported via paste — stored cost in listPrice)
// Same chain as Ashford: yourCost = listPrice, listPrice = listPrice/0.30, tier prices from yourCost
const [res] = await db.query(`
  UPDATE distributor_skus
  SET
    yourCost        = listPrice,
    listPrice       = ROUND(listPrice / ?, 2),
    homeownerPrice  = ROUND(listPrice * ?, 2),
    contractorPrice = ROUND(listPrice * ?, 2),
    wholesalePrice  = ROUND(listPrice * ?, 2)
  WHERE distributorId = ? AND yourCost IS NULL AND listPrice IS NOT NULL
`, [DISCOUNT_RATE, HOMEOWNER_MUL, CONTRACTOR_MUL, WHOLESALE_MUL, MADISON_DIST_ID]);

console.log(`\nFixed ${res.affectedRows} Madison SKUs`);

// Sample after
const [after] = await db.query(
  'SELECT platformSku, listPrice, yourCost, homeownerPrice, contractorPrice, wholesalePrice FROM distributor_skus WHERE distributorId = ? AND platformSku LIKE "MD_SW_%" LIMIT 5',
  [MADISON_DIST_ID]
);
if (after.length > 0) {
  console.log('\nSample AFTER (MD_SW_):');
  for (const r of after) {
    console.log(`  ${r.platformSku}: list=$${r.listPrice} | cost=$${r.yourCost} | homeowner=$${r.homeownerPrice} | contractor=$${r.contractorPrice} | wholesale=$${r.wholesalePrice}`);
  }
}

// Verify math
if (after.length > 0) {
  const v = after[0];
  const cost = Number(v.yourCost);
  const list = Number(v.listPrice);
  const impliedDiscount = cost / list;
  const impliedMarkup = Number(v.homeownerPrice) / cost;
  console.log(`\nMath check: cost/list = ${(impliedDiscount*100).toFixed(1)}% (target: ${DISCOUNT_RATE*100}%) | homeowner/cost = ${impliedMarkup.toFixed(4)}x (target: ${HOMEOWNER_MUL}x)`);
  console.log(impliedDiscount.toFixed(4) === DISCOUNT_RATE.toFixed(4) ? '✅ Discount correct' : '❌ Discount mismatch');
}

// Final summary
const [[sum]] = await db.query(`
  SELECT COUNT(*) as total, SUM(yourCost IS NULL) as missing,
    AVG(CAST(listPrice AS DECIMAL(10,2))) as avgList,
    AVG(CAST(yourCost AS DECIMAL(10,2))) as avgCost,
    AVG(CAST(homeownerPrice AS DECIMAL(10,2))) as avgHomeowner
  FROM distributor_skus WHERE distributorId = ?
`, [MADISON_DIST_ID]);
console.log(`\nFinal: ${sum.total} SKUs | missing yourCost: ${sum.missing}`);
console.log(`Avg list=$${Number(sum.avgList).toFixed(2)} | avg cost=$${Number(sum.avgCost).toFixed(2)} | avg homeowner=$${Number(sum.avgHomeowner).toFixed(2)}`);

await db.end();
console.log('Done.');
