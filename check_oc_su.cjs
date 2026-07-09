const mysql = require('./node_modules/mysql2/promise');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.log('No DATABASE_URL'); process.exit(1); }
  const conn = await mysql.createConnection(dbUrl);
  
  const [cols] = await conn.query('SHOW COLUMNS FROM door_styles');
  console.log('Columns:', cols.map(c => c.Field).join(', '));
  
  const [rows] = await conn.query(
    "SELECT id, ourName, doorStyle, thumbnailImageUrl, isActive FROM door_styles WHERE ourName LIKE ? OR ourName LIKE ?",
    ['%Cashmere%', '%Unfinished%']
  );
  console.log('Found:', rows.length, 'rows');
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
}
main().catch(e => console.error(e.message));
