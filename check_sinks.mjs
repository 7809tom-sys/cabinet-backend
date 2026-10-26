import { createConnection } from 'mysql2/promise';
const url = process.env.DATABASE_URL;

async function main() {
  const conn = await createConnection(url);
  
  // Get all priced sinks
  const [rows] = await conn.execute(
    'SELECT id, name, listPrice, description FROM pelican_products WHERE subCategory = "Sinks" AND listPrice > 0 ORDER BY name'
  );
  
  // Group by model code
  const models = new Map();
  for (const r of rows) {
    const m = r.name.match(/^(PL-\d+)/);
    if (m) {
      if (!models.has(m[1])) models.set(m[1], []);
      models.get(m[1]).push(r.name);
    }
  }
  
  console.log('Total priced sinks:', rows.length);
  console.log('Unique models:', models.size);
  console.log('\nModels:');
  for (const [k, v] of models) {
    console.log(`  ${k}: ${v.length} variants - e.g. "${v[0]}"`);
  }
  
  await conn.end();
}

main().catch(console.error);
