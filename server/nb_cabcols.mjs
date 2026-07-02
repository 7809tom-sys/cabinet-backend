import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [cols] = await conn.query("SHOW COLUMNS FROM cabinets");
for (const c of cols) if (c.Null==='NO' && c.Default==null && c.Extra!=='auto_increment') console.log('REQUIRED (no default):', c.Field, c.Type);
console.log('---- conflictStatus/showInCatalog defs ----');
for (const c of cols) if (['conflictStatus','conflictReason','showInCatalog','showInDesigner','category','description','masterCode','isActive'].includes(c.Field)) console.log(c.Field, c.Type, 'Null='+c.Null, 'Default='+c.Default);
await conn.end();
