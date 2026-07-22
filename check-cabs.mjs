import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(conn);

const rows = await db.execute(sql`
  SELECT id, masterCode, category, subCategory, placementType, height, numberOfDoors, doorOrientation, openingType, doorHeight
  FROM cabinets
  WHERE masterCode LIKE 'U-18%' OR masterCode = 'TK-8' OR masterCode = 'SGH'
  LIMIT 15
`);

console.table(rows[0]);

await conn.end();
