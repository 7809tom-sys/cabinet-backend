import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/cabinet-dealz/.env' });
const dbUrl = process.env.DATABASE_URL;
const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
const [, user, pass, host, port, db] = match;
const conn = await createConnection({ host, port: port ? +port : 3306, user, password: pass, database: db, ssl: { rejectUnauthorized: false } });
const [styles] = await conn.query('SELECT id, ourName, distributorName FROM door_styles WHERE distributorId = 1 ORDER BY id');
console.log('=== Line A (Milestone) Door Styles ===');
for (const s of styles) {
  const [cnt] = await conn.query('SELECT COUNT(*) as n FROM distributor_skus WHERE styleId = ? AND distributorId = 1', [s.id]);
  const [withCost] = await conn.query('SELECT COUNT(*) as n FROM distributor_skus WHERE styleId = ? AND distributorId = 1 AND yourCost IS NOT NULL', [s.id]);
  console.log(`  id=${s.id} | ${s.ourName} (${s.distributorName}) | total=${cnt[0].n} | withCost=${withCost[0].n}`);
}
await conn.end();
