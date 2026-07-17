const mysql = require('mysql2/promise');
const fs = require('fs');
const sql = fs.readFileSync('/home/ubuntu/restore_catalog.sql', 'utf8');
const raw = sql.split('\n').filter(l => !l.startsWith('--') && l.trim() !== '').join('\n');
const statements = raw.split(';').map(s => s.trim()).filter(s => s.length > 5);
console.log('Total statements:', statements.length);
(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  let ok = 0, err = 0;
  for (let i = 0; i < statements.length; i++) {
    try { await conn.query(statements[i]); ok++; if(ok%1000===0) console.log('  '+ok+'/'+statements.length+' done...'); }
    catch(e) { err++; if(err<=5) console.error('  ERR stmt '+i+': '+e.message.slice(0,120)); }
  }
  const [[r]] = await conn.query('SELECT (SELECT COUNT(*) FROM distributors) d, (SELECT COUNT(*) FROM door_styles) ds, (SELECT COUNT(*) FROM cabinets) c, (SELECT COUNT(*) FROM distributor_skus) s');
  console.log('\nFinal counts:', JSON.stringify(r));
  console.log('Completed: '+ok+' ok, '+err+' errors');
  await conn.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
