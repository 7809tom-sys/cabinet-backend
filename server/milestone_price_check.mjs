// Script to check and update Milestone Shaker White prices
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config({ path: '/home/ubuntu/cabinet-dealz/.env' });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
if (!match) { console.error('Cannot parse DATABASE_URL'); process.exit(1); }
const [, user, pass, host, port, db] = match;

const conn = await createConnection({
  host, port: port ? +port : 3306,
  user, password: pass, database: db,
  ssl: { rejectUnauthorized: false }
});

// Find door styles with Shaker White
const [swStyles] = await conn.query(`
  SELECT id, ourName, distributorName, distributorId 
  FROM door_styles 
  WHERE ourName LIKE '%Shaker%' OR distributorName LIKE '%Shaker%' OR ourName LIKE '%SW%'
  LIMIT 20
`);
console.log('\n=== SHAKER DOOR STYLES ===');
for (const s of swStyles) console.log(`  id=${s.id} ourName="${s.ourName}" distName="${s.distributorName}" distId=${s.distributorId}`);

// Find SW-* SKUs in distributor_skus
const [swSkus] = await conn.query(`
  SELECT ds.id, ds.distributorId, ds.distributorSku, ds.platformSku, ds.listPrice, ds.yourCost, ds.adjustedListPrice
  FROM distributor_skus ds
  WHERE ds.distributorSku LIKE 'SW-%'
  ORDER BY ds.distributorSku
  LIMIT 100
`);
console.log(`\n=== SW-* SKUs in distributor_skus (${swSkus.length} rows) ===`);
for (const s of swSkus) {
  console.log(`  distId=${s.distributorId} sku=${s.distributorSku} platform=${s.platformSku} list=${s.listPrice} cost=${s.yourCost}`);
}

// Check all distributor SKUs to find which line has the most SW- items
const [distCounts] = await conn.query(`
  SELECT distributorId, COUNT(*) as cnt 
  FROM distributor_skus 
  WHERE distributorSku LIKE 'SW-%' OR distributorSku LIKE '%-SW-%'
  GROUP BY distributorId
`);
console.log('\n=== Distributor counts for SW-* ===');
for (const d of distCounts) console.log(`  distId=${d.distributorId} count=${d.cnt}`);

await conn.end();
process.exit(0);
