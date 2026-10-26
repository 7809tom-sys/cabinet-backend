import mysql from 'mysql2/promise';
const db=await mysql.createConnection(process.env.DATABASE_URL!);
try {
  const [rows]=await db.query(`
    SELECT c.masterCode, c.description AS masterDescription, ds.supplierDescription AS skuDescription,
           ds.isPublished
    FROM distributor_skus ds
    JOIN distributors d ON d.id=ds.distributorId
    JOIN cabinets c ON c.id=ds.cabinetId
    WHERE d.code='AEF' AND ds.isPublished=1
    ORDER BY c.masterCode, ds.id
  `) as any[];
  const visible=rows.filter(r=>/AltaEuro|U\.?S\.?\s*Cabinet|source:|Spec Book|manufacturer/i.test(`${r.masterDescription||''} ${r.skuDescription||''}`));
  console.log(JSON.stringify({totalRows:rows.length, publicCopyRowsWithSourceOrDistributor:visible.length, samples:visible.slice(0,30)},null,2));
} finally { await db.end(); }
