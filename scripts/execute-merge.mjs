/**
 * Execute the merge SQL statements in batches
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const configPath = resolve('/home/ubuntu/cabinet-dealz/.project-config.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const dbUrl = config.env_vars.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await mysql.createConnection(dbUrl);

// Read the SQL file
const sql = readFileSync('/home/ubuntu/cabinet-dealz/scripts/merge-duplicates.sql', 'utf-8');
const statements = sql.split('\n')
  .filter(line => line.trim() && !line.startsWith('--'))
  .map(s => s.trim());

console.log(`Total SQL statements to execute: ${statements.length}`);

let success = 0;
let errors = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  try {
    await conn.execute(stmt);
    success++;
  } catch (err) {
    errors++;
    console.error(`ERROR on statement ${i + 1}: ${stmt}`);
    console.error(`  ${err.message}`);
  }
  if ((i + 1) % 100 === 0) {
    console.log(`  Progress: ${i + 1}/${statements.length} (${success} ok, ${errors} errors)`);
  }
}

console.log(`\nDone! ${success} statements succeeded, ${errors} errors.`);

// Verify final count
const [rows] = await conn.execute('SELECT COUNT(*) as cnt FROM cabinets WHERE isActive = 1');
console.log(`\nFinal active cabinet count: ${rows[0].cnt}`);

await conn.end();
