import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const sql = readFileSync('/home/ubuntu/update_prices.sql', 'utf8');

// Split on semicolons, strip inline comments from each line first
const statements = sql
  .split('\n')
  .map(line => {
    // Remove inline comments (-- ...) but keep the line
    const commentIdx = line.indexOf('--');
    return commentIdx >= 0 ? line.substring(0, commentIdx) : line;
  })
  .join('\n')
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && s.toUpperCase().startsWith('UPDATE'));

console.log(`Executing ${statements.length} price UPDATE statements...`);

const conn = await mysql.createConnection(process.env.DATABASE_URL);

let success = 0, errors = 0, totalAffected = 0;

for (let i = 0; i < statements.length; i++) {
  try {
    const [result] = await conn.execute(statements[i]);
    success++;
    totalAffected += result.affectedRows || 0;
    if ((i + 1) % 1000 === 0) {
      console.log(`  Progress: ${i + 1}/${statements.length} (${totalAffected} rows affected)`);
    }
  } catch (e) {
    errors++;
    if (errors <= 5) {
      console.error(`  Error on stmt ${i + 1}: ${e.message}`);
      console.error(`  SQL: ${statements[i].substring(0, 120)}`);
    }
  }
}

await conn.end();
console.log(`\nDone!`);
console.log(`  Success: ${success}`);
console.log(`  Errors: ${errors}`);
console.log(`  Total rows affected: ${totalAffected}`);
