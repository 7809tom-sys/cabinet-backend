import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Authoritative Ashford styles (exactly 13)
const ASHFORD_CODES = new Set(['ASP','CC','CS','RH','DN','GV','FS','HS','MBS','NG','PS','WPG','WS']);

// Authoritative Preston styles (32)
const PRESTON_CODES = new Set(['SW','GR','SE','NB','AG','IB','SA','LG','SB','TC','RW','AW','AC','DSG','DDW','CW','SDW','SAG','SIB','SAO','SWO','HW','HG','MB','MI','OB','OS','CG','MG','FW','FG','FE']);

// Authoritative Madison styles (21)
const MADISON_CODES = new Set(['SA','SD','SG','SW','SI','SN','SB','SH','SC','EW','OW','OS','CW','CS','HD','OM','OT','HE','SEO','SU','OC']);

console.log('=== Identifying extra Ashford styles ===\n');

const [ashfordStyles] = await conn.query(`
  SELECT ds.id, ds.styleCode, ds.ourName,
    COUNT(dsk.id) as skuCount
  FROM door_styles ds
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
  WHERE ds.distributorId = 2
  GROUP BY ds.id, ds.styleCode, ds.ourName
  ORDER BY ds.styleCode
`);

console.log(`Total Ashford styles: ${ashfordStyles.length}`);
const extras = [];
const correct = [];

for (const s of ashfordStyles) {
  const isAuth = ASHFORD_CODES.has(s.styleCode);
  if (isAuth) {
    correct.push(s);
    console.log(`  ✓ ${s.styleCode.padEnd(6)} ${s.ourName.padEnd(35)} ${s.skuCount} SKUs`);
  } else {
    const dest = PRESTON_CODES.has(s.styleCode) ? 'Preston' : MADISON_CODES.has(s.styleCode) ? 'Madison' : 'UNKNOWN';
    extras.push({ ...s, dest });
    console.log(`  ❌ ${s.styleCode.padEnd(6)} ${s.ourName.padEnd(35)} ${s.skuCount} SKUs → ${dest}`);
  }
}

console.log(`\nCorrect: ${correct.length}, Extra: ${extras.length}`);

// For each extra, check if target distributor already has same code
console.log('\n=== Analyzing extras ===');
for (const s of extras) {
  const targetDistId = s.dest === 'Preston' ? 3 : s.dest === 'Madison' ? 1 : null;
  if (!targetDistId) {
    console.log(`\n${s.styleCode} "${s.ourName}" — no known target distributor`);
    continue;
  }
  const [match] = await conn.query(`
    SELECT ds.id, ds.ourName, COUNT(dsk.id) as skuCount
    FROM door_styles ds
    LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
    WHERE ds.distributorId = ? AND ds.styleCode = ?
    GROUP BY ds.id, ds.ourName LIMIT 1
  `, [targetDistId, s.styleCode]);
  
  if (match.length > 0) {
    const m = match[0];
    console.log(`${s.styleCode} "${s.ourName}" (Ashford, ${s.skuCount} SKUs) → merge into ${s.dest} "${m.ourName}" (${m.skuCount} SKUs)`);
  } else {
    console.log(`${s.styleCode} "${s.ourName}" (Ashford, ${s.skuCount} SKUs) → reassign to ${s.dest} (no existing record)`);
  }
}

// Now perform the fix
console.log('\n=== Performing fix ===');
let totalMoved = 0, totalDeleted = 0, totalReassigned = 0;

for (const s of extras) {
  const targetDistId = s.dest === 'Preston' ? 3 : s.dest === 'Madison' ? 1 : null;
  if (!targetDistId) {
    console.log(`SKIP ${s.styleCode} — unknown target`);
    continue;
  }
  
  const [match] = await conn.query(`
    SELECT ds.id, ds.ourName FROM door_styles ds
    WHERE ds.distributorId = ? AND ds.styleCode = ? LIMIT 1
  `, [targetDistId, s.styleCode]);
  
  if (match.length > 0) {
    const target = match[0];
    // Move SKUs
    const [mv] = await conn.query(`
      UPDATE distributor_skus SET styleId = ?, distributorId = ?
      WHERE styleId = ?
    `, [target.id, targetDistId, s.id]);
    totalMoved += mv.affectedRows;
    // Delete the Ashford duplicate
    await conn.query(`DELETE FROM door_styles WHERE id = ?`, [s.id]);
    totalDeleted++;
    console.log(`  Merged ${s.styleCode} "${s.ourName}" → ${s.dest} "${target.ourName}" (${mv.affectedRows} SKUs moved)`);
  } else {
    // No target record — just reassign distributorId
    await conn.query(`UPDATE door_styles SET distributorId = ? WHERE id = ?`, [targetDistId, s.id]);
    totalReassigned++;
    console.log(`  Reassigned ${s.styleCode} "${s.ourName}" → ${s.dest} (new record there)`);
  }
}

// Final verification
const [summary] = await conn.query(`
  SELECT d.name, COUNT(DISTINCT ds.id) as styleCount, COUNT(dsk.id) as skuCount
  FROM distributors d
  LEFT JOIN door_styles ds ON ds.distributorId = d.id
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
  GROUP BY d.id, d.name ORDER BY d.name
`);

const [conflicts] = await conn.query(`
  SELECT COUNT(*) as cnt FROM (
    SELECT styleId, COUNT(DISTINCT distributorId) as dc
    FROM distributor_skus GROUP BY styleId HAVING dc > 1
  ) t
`);

console.log('\n=== SUMMARY ===');
console.log(`SKUs moved: ${totalMoved}, Records deleted: ${totalDeleted}, Reassigned: ${totalReassigned}`);
console.log(`Multi-distributor conflicts: ${conflicts[0].cnt}`);
for (const r of summary) {
  console.log(`  ${r.name}: ${r.styleCount} styles, ${r.skuCount} SKUs`);
}

// Final Ashford list
const [finalAshford] = await conn.query(`
  SELECT ds.styleCode, ds.ourName, COUNT(dsk.id) as skuCount
  FROM door_styles ds
  LEFT JOIN distributor_skus dsk ON dsk.styleId = ds.id
  WHERE ds.distributorId = 2
  GROUP BY ds.id, ds.styleCode, ds.ourName ORDER BY ds.styleCode
`);
console.log(`\nFinal Ashford (${finalAshford.length}):`);
for (const r of finalAshford) {
  console.log(`  ${r.styleCode.padEnd(6)} ${r.ourName.padEnd(35)} ${r.skuCount} SKUs`);
}

await conn.end();
