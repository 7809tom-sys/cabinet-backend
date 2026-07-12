import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/cabinet-dealz/.env' });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find Floral Grey style
const [styles] = await conn.execute(
  `SELECT id, ourName, distributorName, doorStyle FROM door_styles WHERE distributorId = 1 AND (ourName LIKE '%floral%' OR ourName LIKE '%floor%' OR distributorName LIKE '%floral%') ORDER BY id`
);
console.log('Floral styles:', styles);

// Check existing FG- SKUs
const [skus] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM distributor_skus WHERE distributorSku LIKE 'FG-%' AND distributorId = 1`
);
console.log('Existing FG- SKUs:', skus[0].cnt);

// Get a sample
const [sample] = await conn.execute(
  `SELECT distributorSku, yourCost, listPrice, styleId FROM distributor_skus WHERE distributorSku LIKE 'FG-%' AND distributorId = 1 LIMIT 5`
);
console.log('Sample FG SKUs:', sample);

await conn.end();
