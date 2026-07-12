import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check the Floral style entries - distributorId and SKU counts
const [styles] = await conn.execute(
  `SELECT ds.id, ds.ourName, ds.distributorId, ds.distributorName,
          COUNT(sk.id) as skuCount
   FROM door_styles ds
   LEFT JOIN distributor_skus sk ON sk.styleId = ds.id
   WHERE ds.ourName LIKE '%floral%' OR ds.ourName LIKE '%Floral%'
   GROUP BY ds.id
   ORDER BY ds.ourName, ds.id`
);
console.log('Floral style entries:');
styles.forEach(r => console.log(`  [${r.id}] "${r.ourName}" | distId=${r.distributorId} | distName="${r.distributorName}" | SKUs=${r.skuCount}`));

await conn.end();
