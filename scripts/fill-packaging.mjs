import mysql from 'mysql2/promise';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('.project-config.json', 'utf8'));
const dbUrl = config.env?.DATABASE_URL || process.env.DATABASE_URL;

async function main() {
  const conn = await mysql.createConnection(dbUrl);

  // 1. Get US Cabinet Depot items (945xxxx) as weight reference - they have 100% weights
  const [refRows] = await conn.execute(
    `SELECT id, masterCode, category, width, height, depth, weight
     FROM cabinets WHERE id BETWEEN 9450000 AND 9459999 AND weight > 0`
  );
  console.log(`Reference items (US Cabinet Depot): ${refRows.length}`);

  // Build lookup: category -> sorted by width for closest match
  const refByCategory = {};
  for (const r of refRows) {
    const cat = (r.category || 'Base').toLowerCase();
    if (!refByCategory[cat]) refByCategory[cat] = [];
    refByCategory[cat].push({
      width: parseFloat(r.width) || 0,
      height: parseFloat(r.height) || 0,
      depth: parseFloat(r.depth) || 0,
      weight: parseFloat(r.weight)
    });
  }
  // Sort each category by width
  for (const cat of Object.keys(refByCategory)) {
    refByCategory[cat].sort((a, b) => a.width - b.width);
  }

  // 2. Get all active cabinets that need updates
  const [rows] = await conn.execute(
    `SELECT id, masterCode, category, width, height, depth, weight, pkgLength, pkgWidth, pkgHeight
     FROM cabinets WHERE isActive = true`
  );
  console.log(`Total active cabinets: ${rows.length}`);

  // 3. Find closest weight from US Cabinet Depot reference
  function estimateWeight(category, width, height, depth) {
    const cat = (category || 'base').toLowerCase();
    const refs = refByCategory[cat] || refByCategory['base'] || [];
    if (refs.length === 0) return Math.round(width * 2); // fallback: 2 lbs per inch of width

    // Find closest by width
    let closest = refs[0];
    let minDiff = Math.abs(refs[0].width - width);
    for (const r of refs) {
      const diff = Math.abs(r.width - width);
      if (diff < minDiff) {
        minDiff = diff;
        closest = r;
      }
    }

    // If heights differ significantly, scale proportionally
    if (closest.height > 0 && height > 0) {
      const heightRatio = height / closest.height;
      const widthRatio = width / (closest.width || width);
      return Math.round(closest.weight * widthRatio * heightRatio);
    }

    return Math.round(closest.weight * (width / (closest.width || width)));
  }

  // 4. Build updates
  let pkgUpdates = 0;
  let weightUpdates = 0;
  const sqls = [];

  for (const row of rows) {
    const w = parseFloat(row.width) || 0;
    const h = parseFloat(row.height) || 0;
    const d = parseFloat(row.depth) || 0;

    if (w === 0 && h === 0 && d === 0) continue;

    const needsPkg = !row.pkgLength || parseFloat(row.pkgLength) === 0;
    const needsWeight = !row.weight || parseFloat(row.weight) === 0;

    if (!needsPkg && !needsWeight) continue;

    const setClauses = [];
    const params = [];

    if (needsPkg) {
      // Longest two dims rounded up to nearest whole inch, 7" thick
      const dims = [w, h, d].sort((a, b) => b - a);
      const pkgL = Math.ceil(dims[0]);
      const pkgW = Math.ceil(dims[1]);
      setClauses.push('pkgLength = ?', 'pkgWidth = ?', 'pkgHeight = ?');
      params.push(pkgL, pkgW, 7);
      pkgUpdates++;
    }

    if (needsWeight) {
      let estWeight = estimateWeight(row.category, w, h, d);
      if (estWeight < 3) estWeight = 3;
      if (estWeight > 350) estWeight = 350;
      setClauses.push('weight = ?');
      params.push(estWeight);
      weightUpdates++;
    }

    params.push(row.id);
    sqls.push({ sql: `UPDATE cabinets SET ${setClauses.join(', ')} WHERE id = ?`, params });
  }

  console.log(`\nPackaging updates: ${pkgUpdates}`);
  console.log(`Weight estimates: ${weightUpdates}`);
  console.log(`Total SQL statements: ${sqls.length}`);

  // Execute
  let done = 0;
  for (const s of sqls) {
    await conn.execute(s.sql, s.params);
    done++;
    if (done % 100 === 0) console.log(`  ...${done}/${sqls.length}`);
  }
  console.log(`\nCompleted ${done} updates.`);

  // Verify
  const [verify] = await conn.execute(
    `SELECT 
      SUM(CASE WHEN pkgLength IS NULL OR pkgLength = 0 THEN 1 ELSE 0 END) as missing_pkg,
      SUM(CASE WHEN weight IS NULL OR weight = 0 THEN 1 ELSE 0 END) as missing_weight
     FROM cabinets WHERE isActive = true`
  );
  console.log(`\nRemaining gaps: pkg=${verify[0].missing_pkg}, weight=${verify[0].missing_weight}`);

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
