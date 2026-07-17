import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const sql = readFileSync('/home/ubuntu/update_all.sql', 'utf8');

// Split into individual statements
const statements = sql
  .split('\n')
  .filter(line => !line.startsWith('--') && line.trim())
  .join('\n')
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && s.toUpperCase().startsWith('UPDATE'));

console.log(`Executing ${statements.length} UPDATE statements...`);

const conn = await mysql.createConnection(process.env.DATABASE_URL);

let success = 0;
let errors = 0;
let totalAffected = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  try {
    const [result] = await conn.execute(stmt);
    success++;
    totalAffected += result.affectedRows || 0;
    if ((i + 1) % 500 === 0) {
      console.log(`  Progress: ${i + 1}/${statements.length} (${totalAffected} rows affected so far)`);
    }
  } catch (e) {
    errors++;
    if (errors <= 5) {
      console.error(`  Error on statement ${i + 1}: ${e.message}`);
      console.error(`  SQL: ${stmt.substring(0, 100)}`);
    }
  }
}

await conn.end();

console.log(`\nDone!`);
console.log(`  Success: ${success}`);
console.log(`  Errors: ${errors}`);
console.log(`  Total rows affected: ${totalAffected}`);
