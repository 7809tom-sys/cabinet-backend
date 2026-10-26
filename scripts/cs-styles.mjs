import { createConnection } from "mysql2/promise";
const url = process.env.DATABASE_URL;
const conn = await createConnection(url);

const [rows] = await conn.execute(`
  SELECT DISTINCT ds.id, ds.styleCode, ds.ourName, ds.doorStyle, ds.color, ds.finish, ds.woodSpecies
  FROM door_styles ds
  JOIN distributor_skus sku ON sku.styleId = ds.id
  JOIN distributors d ON d.id = sku.distributorId
  WHERE d.code = 'CS'
  ORDER BY ds.ourName
`);

console.log(JSON.stringify(rows, null, 2));
await conn.end();
