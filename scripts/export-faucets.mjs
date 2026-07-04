import mysql from "mysql2/promise";
import fs from "fs";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all faucet products
const [rows] = await conn.execute(
  `SELECT id, pelicanCode, name, description, category, subCategory, size 
   FROM pelican_products 
   WHERE category LIKE '%faucet%' OR category LIKE '%Faucet%' 
      OR subCategory LIKE '%faucet%' OR name LIKE '%faucet%' OR name LIKE '%Faucet%'
   ORDER BY category, subCategory, pelicanCode`
);

console.log(`Found ${rows.length} faucet products\n`);

// Also get products with generic/unnamed descriptions
const [generic] = await conn.execute(
  `SELECT id, pelicanCode, name, description, category, subCategory, size 
   FROM pelican_products 
   WHERE (description = '' OR description IS NULL OR description = name OR description LIKE '%PR%')
     AND isActive = 1
   ORDER BY category, pelicanCode
   LIMIT 100`
);

console.log(`Found ${generic.length} products with generic/empty descriptions\n`);

// Write to file for review
const output = {
  faucets: rows,
  genericProducts: generic,
};

fs.writeFileSync("/home/ubuntu/pelican-products-to-brand.json", JSON.stringify(output, null, 2));
console.log("Written to /home/ubuntu/pelican-products-to-brand.json");

await conn.end();
