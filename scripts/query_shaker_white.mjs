// Query Shaker White styles
import { createConnection } from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await createConnection(dbUrl);
const [rows] = await conn.execute(`
  SELECT ds.id, ds.ourName, ds.styleCode, ds.distributorId, ds.distributorName, ds.isActive,
    (SELECT COUNT(*) FROM distributor_skus dsk WHERE dsk.styleId = ds.id) as skuCount,
    d.name as distName, d.id as dId
  FROM door_styles ds
  LEFT JOIN distributors d ON d.id = ds.distributorId
  WHERE ds.ourName LIKE '%Shaker White%' OR ds.distributorName LIKE '%Shaker White%' OR ds.styleCode = 'SW'
  ORDER BY ds.ourName, ds.id
`);
console.log(JSON.stringify(rows, null, 2));
await conn.end();
