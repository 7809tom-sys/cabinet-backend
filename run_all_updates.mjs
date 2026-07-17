import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

async function runSqlFile(conn, filePath, label) {
  const sql = readFileSync(filePath, 'utf8');
  const statements = sql
    .split('\n')
    .filter(line => !line.startsWith('--') && line.trim())
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.toUpperCase().startsWith('UPDATE'));

  console.log(`\n[${label}] Executing ${statements.length} statements...`);
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
      if (errors <= 3) {
        console.error(`  Error on stmt ${i + 1}: ${e.message}`);
        console.error(`  SQL: ${statements[i].substring(0, 100)}`);
      }
    }
  }
  console.log(`[${label}] Done: ${success} ok, ${errors} errors, ${totalAffected} rows affected`);
  return { success, errors, totalAffected };
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

await runSqlFile(conn, '/home/ubuntu/update_images_only.sql', 'IMAGES');
await runSqlFile(conn, '/home/ubuntu/update_prices.sql', 'PRICES');

await conn.end();
console.log('\nAll updates complete!');
