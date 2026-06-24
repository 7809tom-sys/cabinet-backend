import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [cols] = await c.query("SHOW COLUMNS FROM door_styles");
console.log('COLUMNS:', cols.map(r=>r.Field).join(', '));
const [tot] = await c.query("SELECT COUNT(*) n FROM door_styles");
console.log('total styles:', tot[0].n);
for (const col of ['roomSceneImageUrl','doorSampleImageUrl','thumbnailUrl']) {
  try {
    const [r] = await c.query(`SELECT COUNT(*) n FROM door_styles WHERE \`${col}\` IS NOT NULL AND \`${col}\` <> ''`);
    console.log(`${col} populated:`, r[0].n);
  } catch(e){ console.log(`${col}: (no such column)`); }
}
await c.end();
