const mysql = require("/home/ubuntu/cabinet-dealz/node_modules/mysql2/promise");
(async () => {
  const c = await mysql.createConnection(process.env.DATABASE_URL);
  const [k] = await c.query(`SELECT c.id, c.masterCode, c.description, c.category, c.subCategory, c.corner_type cornerType, c.isCornerCabinet, c.placementType, c.width, c.height, c.depth, c.hingeSide,
    (SELECT GROUP_CONCAT(DISTINCT d.name ORDER BY d.name) FROM distributor_skus ds JOIN distributors d ON d.id=ds.distributorId WHERE ds.cabinetId=c.id AND ds.isPublished=1 AND ds.isAvailable=1) AS lineNames
    FROM cabinets c WHERE c.conflictStatus<>'conflict' AND c.masterCode NOT LIKE 'ARCHIVE-%' ORDER BY c.masterCode`);
  const re = /^(BBC|WBC|BLB|LSB?|CSB|WLS|DCW|DCB|ER|ERB|BER|WER|WDC|KWD|AG-|AG\d|CAG)/;
  const out = [];
  for (const r of k) {
    const code = r.masterCode.toUpperCase();
    const desc = (r.description || "").toLowerCase();
    if (/^AW[-\d]/.test(code)) continue;
    const isCorner = re.test(code) || /-CNR|CORNER/.test(code) || /corner|lazy susan|easy reach|blind|diagonal|angled (wall|corner)/.test(desc) || r.isCornerCabinet === 1 || r.cornerType;
    if (isCorner) out.push({ code: r.masterCode, desc: (r.description || "").slice(0, 44), cat: r.category, sub: r.subCategory, ct: r.cornerType, flag: r.isCornerCabinet, pl: r.placementType, w: r.width, h: r.height, d: r.depth, lines: r.lineNames });
  }
  console.log("corner-family count", out.length);
  console.table(out);
  await c.end();
})();
