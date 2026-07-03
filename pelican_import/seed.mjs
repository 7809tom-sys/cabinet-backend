import fs from 'fs';
import mysql from 'mysql2/promise';
const rows = JSON.parse(fs.readFileSync('/home/ubuntu/cabinet-dealz/pelican_import/pelican_seed.json','utf8'));
const c = await mysql.createConnection(process.env.DATABASE_URL);
await c.query('TRUNCATE TABLE pelican_products');
const cols = ['pelicanCode','slug','name','description','category','subCategory','size','listPrice','priceTier2','priceTier3','priceTier4','msrp','tiered','isPopular','popularRank','showInDesigner','showInCatalog'];
const ph = '(' + cols.map(()=>'?').join(',') + ')';
let inserted=0;
for (let i=0;i<rows.length;i+=100){
  const batch = rows.slice(i,i+100);
  const sql = 'INSERT INTO pelican_products ('+cols.join(',')+') VALUES ' + batch.map(()=>ph).join(',');
  const vals = [];
  for (const r of batch){ vals.push(r.pelicanCode,r.slug,r.name,r.description,r.category,r.subCategory??null,r.size??null,r.listPrice??null,r.priceTier2??null,r.priceTier3??null,r.priceTier4??null,r.msrp??null,r.tiered?1:0,r.isPopular?1:0,r.popularRank||0,r.showInDesigner?1:0,r.showInCatalog?1:0); }
  const [res] = await c.query(sql, vals); inserted += res.affectedRows;
}
const [[{n}]] = await c.query('SELECT COUNT(*) n FROM pelican_products');
const [cat] = await c.query('SELECT category, COUNT(*) n, SUM(showInCatalog) vis, SUM(isPopular) pop FROM pelican_products GROUP BY category ORDER BY n DESC');
console.log('INSERTED:', inserted, 'TOTAL:', n);
console.table(cat);
await c.end();
