import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Show current names
const [before] = await conn.execute(
  `SELECT id, ourName, distributorName FROM door_styles 
   WHERE ourName LIKE '%floor%' OR ourName LIKE '%floral%' OR distributorName LIKE '%floral%'
   ORDER BY ourName`
);
console.log('Before:');
before.forEach(r => console.log(`  [${r.id}] ourName="${r.ourName}" | distributorName="${r.distributorName}"`));

// Fix the names
const fixes = [
  { from: 'Floor Gray',     to: 'Floral Grey' },
  { from: 'Floor White',    to: 'Floral White' },
  { from: 'Floor Espresso', to: 'Floral Espresso' },
];

for (const fix of fixes) {
  const [result] = await conn.execute(
    `UPDATE door_styles SET ourName = ? WHERE ourName = ?`,
    [fix.to, fix.from]
  );
  console.log(`\n"${fix.from}" -> "${fix.to}": ${result.affectedRows} row(s) updated`);
}

// Verify
const [after] = await conn.execute(
  `SELECT id, ourName, distributorName FROM door_styles 
   WHERE ourName LIKE '%floral%' OR ourName LIKE '%floor%'
   ORDER BY ourName`
);
console.log('\nAfter:');
after.forEach(r => console.log(`  [${r.id}] ourName="${r.ourName}" | distributorName="${r.distributorName}"`));

await conn.end();
