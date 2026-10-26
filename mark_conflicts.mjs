import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '/home/ubuntu/cabinet-dealz/.env' });

const skuList = readFileSync('/home/ubuntu/conflict_sku_list.txt', 'utf8')
  .split('\n')
  .map(s => s.trim())
  .filter(Boolean);

console.log(`Marking ${skuList.length} SKUs as rejected (conflict)...`);

const conn = await createConnection(process.env.DATABASE_URL);

// Process in batches of 200
let totalUpdated = 0;
for (let i = 0; i < skuList.length; i += 200) {
  const batch = skuList.slice(i, i + 200);
  const placeholders = batch.map(() => '?').join(',');
  const [result] = await conn.execute(
    `UPDATE distributor_skus SET status = 'rejected', supplierCabinetName = COALESCE(supplierCabinetName, 'CONFLICT: SKU not found at U.S. Cabinet Depot') WHERE distributorSku IN (${placeholders})`,
    batch
  );
  totalUpdated += result.affectedRows;
  process.stdout.write(`\rProcessed ${Math.min(i + 200, skuList.length)}/${skuList.length}, updated ${totalUpdated} rows...`);
}

console.log(`\nDone! Total distributor_skus rows marked as rejected: ${totalUpdated}`);

// Check breakdown
const [rows] = await conn.execute("SELECT status, COUNT(*) as cnt FROM distributor_skus GROUP BY status");
console.log('Status breakdown:', rows);

await conn.end();
