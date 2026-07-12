import mysql from 'mysql2/promise';
import fs from 'fs';

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Get all SG- SKUs from DB
const [sgSkus] = await db.execute(
  `SELECT distributorSku, yourCost FROM distributor_skus WHERE distributorSku LIKE 'SG-%' ORDER BY distributorSku`
);
console.log(`Total SG- SKUs in DB: ${sgSkus.length}`);
fs.writeFileSync('/home/ubuntu/db_sg_skus.json', JSON.stringify(sgSkus, null, 2));

// Also get universal accessory SKUs (no style prefix)
const [univSkus] = await db.execute(
  `SELECT distributorSku, yourCost FROM distributor_skus WHERE distributorSku LIKE 'RS%' OR distributorSku LIKE 'Shelf%' OR distributorSku LIKE 'Skin%' OR distributorSku LIKE 'Waste%' OR distributorSku LIKE 'Wood%' OR distributorSku LIKE 'Chrome%' ORDER BY distributorSku`
);
console.log(`Universal accessory SKUs: ${univSkus.length}`);
console.log(JSON.stringify(univSkus));

await db.end();
