const mysql=require("/home/ubuntu/cabinet-dealz/node_modules/mysql2/promise");
(async()=>{const c=await mysql.createConnection(process.env.DATABASE_URL);
const [r]=await c.query(`SELECT d.id dist,d.name,c.masterCode,c.category,c.subCategory,c.isCornerCabinet,c.width,c.height,c.depth,COUNT(*) n
 FROM distributor_skus ds JOIN cabinets c ON c.id=ds.cabinetId JOIN distributors d ON d.id=ds.distributorId
 WHERE ds.isAvailable=1 AND ds.isPublished=1 AND (c.isCornerCabinet=1 OR c.masterCode REGEXP '^(ERB|BER|LSB|LS|BLB|BBC|BC|BLS|CSB|WDC|DCW|WBC|WBL|WER|WC|WDCB|BCR|BLR|CW|DC|SB|BD|LCB|EZR|BECR|BEC)[0-9]' OR LOWER(c.description) REGEXP 'corner|lazy|susan|easy.reach|blind')
 GROUP BY d.id,c.masterCode ORDER BY d.id,c.masterCode`);
console.table(r.map(x=>({...x,n:Number(x.n)})));
const [d]=await c.query("SELECT id,name,isActive FROM distributors ORDER BY id");console.table(d);
await c.end();})().catch(e=>{console.error(e);process.exit(1)});
