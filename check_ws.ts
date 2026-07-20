import { getDb } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.error('No DB connection'); process.exit(1); }

  const result = await db.execute(sql`
    SELECT 
      ds.id,
      ds.styleCode,
      ds.ourName,
      ds.aliasName,
      ds.distributorName,
      ds.color,
      ds.doorStyle,
      COUNT(sk.id) AS skuCount,
      SUM(CASE WHEN sk.isPublished=1 THEN 1 ELSE 0 END) AS publishedCount
    FROM door_styles ds
    LEFT JOIN distributor_skus sk ON sk.styleId = ds.id
    WHERE ds.ourName LIKE '%White%Shaker%'
       OR ds.ourName LIKE '%Shaker%White%'
       OR ds.aliasName LIKE '%White%Shaker%'
       OR ds.aliasName LIKE '%Shaker%White%'
       OR ds.distributorName LIKE '%White%Shaker%'
       OR ds.distributorName LIKE '%Shaker%White%'
       OR ds.styleCode = 'SW'
    GROUP BY ds.id
    LIMIT 30
  `);

  // mysql2 returns [rows, fields] tuple
  const rows = (result as any).rows ?? (result as any)[0] ?? result;
  console.log('Row count:', Array.isArray(rows) ? rows.length : 'not array');
  console.log('First row keys:', rows[0] ? Object.keys(rows[0]) : 'none');
  for (const r of rows) {
    console.log(`id=${r.id} code=${r.styleCode} ourName="${r.ourName}" alias="${r.aliasName}" distName="${r.distributorName}" color="${r.color}" skus=${r.skuCount} published=${r.publishedCount}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
