import { createConnection } from 'mysql2/promise';
import { writeFileSync } from 'fs';

const c = await createConnection(process.env.DATABASE_URL || '');
const [rows] = await c.execute(`
  SELECT ds.id, ds.ourName, ds.styleCode, ds.distributorId, d.name as distName, d.code as distCode,
         ds.doorStyle, ds.woodSpecies, ds.finish, ds.color, ds.isFeatured, ds.isActive,
         (SELECT COUNT(*) FROM distributor_skus WHERE styleId=ds.id) as skuCount
  FROM door_styles ds
  LEFT JOIN distributors d ON d.id=ds.distributorId
  WHERE ds.isActive=1
  ORDER BY ds.distributorId, ds.ourName
`);
await c.end();

let out = 'ID\tourName\tstyleCode\tdistributor\tskuCount\tdoorStyle\twoodSpecies\tfinish\tcolor\n';
for (const r of rows) {
  out += `${r.id}\t${r.ourName}\t${r.styleCode}\t${r.distName}(${r.distCode})\t${r.skuCount}\t${r.doorStyle||''}\t${r.woodSpecies||''}\t${r.finish||''}\t${r.color||''}\n`;
}
writeFileSync('/home/ubuntu/door-styles-audit.tsv', out);
console.log(`Written ${rows.length} styles to /home/ubuntu/door-styles-audit.tsv`);
