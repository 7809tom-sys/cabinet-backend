import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config({ path: '/home/ubuntu/cabinet-dealz/.env' });

const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  `SELECT id, ourName, styleCode, distributorId FROM door_styles ORDER BY ourName`
);
console.log('All door styles:');
rows.forEach(r => console.log(`  [${r.id}] ${r.ourName} (code: ${r.styleCode}, dist: ${r.distributorId})`));
await conn.end();
