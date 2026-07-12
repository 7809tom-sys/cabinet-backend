// Check the 16 missing Shaker White SKUs
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config({ path: '/home/ubuntu/cabinet-dealz/.env' });

const dbUrl = process.env.DATABASE_URL;
const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
const [, user, pass, host, port, db] = match;

const conn = await createConnection({
  host, port: port ? +port : 3306,
  user, password: pass, database: db,
  ssl: { rejectUnauthorized: false }
});

const missing = ['SW-BT09','SW-B30','SW-BFH12','SW-BFH24','SW-SB27','SW-SB30','SW-CSB36','SW-BEC24','SW-ERB33','SW-BES12','SW-SPB6','SW-BSDC6','SW-MB30','SW-BWB18','SW-DFB18','SW-W2418'];

// Check if they exist with slightly different codes
for (const sku of missing) {
  const base = sku.replace('SW-', '');
  const [rows] = await conn.query(
    `SELECT id, distributorSku, platformSku, yourCost, listPrice 
     FROM distributor_skus 
     WHERE distributorId = 1 AND (distributorSku LIKE ? OR distributorSku LIKE ? OR platformSku LIKE ?)
     LIMIT 3`,
    [`%${base}%`, `SW-${base}%`, `${base}-%`]
  );
  if (rows.length > 0) {
    console.log(`FOUND variants for ${sku}:`);
    for (const r of rows) console.log(`  id=${r.id} distSku="${r.distributorSku}" platSku="${r.platformSku}" cost=${r.yourCost}`);
  } else {
    console.log(`NOT FOUND: ${sku} (base: ${base})`);
  }
}

// Also check what BT09, B30, BFH* look like in the DB
console.log('\n=== Checking BT, BFH, SB, CSB, BEC, ERB, BES, SPB, BSDC, MB, BWB, DFB patterns ===');
const patterns = ['BT09', 'B30', 'BFH12', 'BFH24', 'SB27', 'SB30', 'CSB36', 'BEC24', 'ERB33', 'BES12', 'SPB6', 'BSDC6', 'MB30', 'BWB18', 'DFB18', 'W2418'];
for (const p of patterns) {
  const [rows] = await conn.query(
    `SELECT distributorSku, platformSku FROM distributor_skus WHERE distributorId = 1 AND distributorSku LIKE ? LIMIT 2`,
    [`%${p}%`]
  );
  if (rows.length > 0) {
    console.log(`  ${p}: ${rows.map(r => r.distributorSku).join(', ')}`);
  } else {
    console.log(`  ${p}: NOT IN DB`);
  }
}

await conn.end();
process.exit(0);
