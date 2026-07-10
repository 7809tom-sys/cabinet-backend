/**
 * Oxford Cashmere SKU Import Script
 * - Inserts master cabinet records into `cabinets`
 * - Inserts distributor SKU records into `distributor_skus`
 * - Uses USCD product group thumbnail images as catalogImageUrl / imageUrl
 *
 * Known IDs:
 *   distributorId = 1  (Line A / USCD)
 *   styleId       = 150001  (Oxford Cashmere door style)
 */

import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

const DISTRIBUTOR_ID = 1;
const STYLE_ID = 150001;
const BASE_S3 = 'https://prod-uscd-product-files.s3.amazonaws.com/';

// ─── Image URL mapping ────────────────────────────────────────────────────────
function getImageUrl(sku) {
  const s = sku.toUpperCase();
  // Base Cabinets
  if (/^OC-BT\d/.test(s))           return BASE_S3 + 'CAPBT9.png';
  if (/^OC-B\d+(FH)$/.test(s)) {
    const w = parseInt(s.match(/OC-B(\d+)/)?.[1] || '0');
    return BASE_S3 + (w <= 21 ? 'CAPBFH1DO.png' : 'CAPBFH2DO.png');
  }
  if (/^OC-SB\d+/.test(s))          return BASE_S3 + 'CAPBSB.png';
  if (/^OC-BSP\d+/.test(s))         return BASE_S3 + 'CAPBSP.png';
  if (/^OC-BBLIND/.test(s))         return BASE_S3 + 'CAPBBLIND.png';
  if (/^OC-BBC\d+/.test(s))         return BASE_S3 + 'CAPBBCORNER.png';
  if (/^OC-B\d+(DR|DRW)/.test(s))   return BASE_S3 + 'CAPBDR.png';
  if (/^OC-BD\d+/.test(s))          return BASE_S3 + 'CAPBD.png';
  if (/^OC-B\d+WB/.test(s))         return BASE_S3 + 'CAPBWB.png';
  if (/^OC-B\d+TRASH/.test(s))      return BASE_S3 + 'CAPBTRASH.png';
  if (/^OC-B\d+D$/.test(s))         return BASE_S3 + 'CAPB2DO.png';
  if (/^OC-B\d+[LR]$/.test(s))      return BASE_S3 + 'CAPB1DO.png';
  if (/^OC-B\d+$/.test(s))          return BASE_S3 + 'CAPB1DO.png';
  // Wall Cabinets
  if (/^OC-WBLIND/.test(s))         return BASE_S3 + 'CAPWBLIND.png';
  if (/^OC-WBC\d+/.test(s))         return BASE_S3 + 'CAPWBCORNER.png';
  if (/^OC-WDC\d+/.test(s))         return BASE_S3 + 'CAPWDC.png';
  if (/^OC-WSV\d+/.test(s))         return BASE_S3 + 'CAPWSV.png';
  if (/^OC-WO\d+/.test(s))          return BASE_S3 + 'CAPWO.png';
  if (/^OC-WMW\d+/.test(s))         return BASE_S3 + 'CAPWMW.png';
  if (/^OC-WGD\d+/.test(s))         return BASE_S3 + 'CAPWGD.png';
  if (/^OC-W\d+\d+D$/.test(s))      return BASE_S3 + 'CAPW2DO.png';
  if (/^OC-W\d+/.test(s))           return BASE_S3 + 'CAPW1DO.png';
  // Tall Cabinets
  if (/^OC-TP\d+/.test(s))          return BASE_S3 + 'CAPTPANT.png';
  if (/^OC-TOVEN/.test(s))          return BASE_S3 + 'CAPTOVEN.png';
  if (/^OC-TREF/.test(s))           return BASE_S3 + 'CAPTREF.png';
  if (/^OC-T\d+/.test(s))           return BASE_S3 + 'CAPT1DO.png';
  // Vanity
  if (/^OC-VSB\d+/.test(s))         return BASE_S3 + 'CAPVSB.png';
  if (/^OC-VD\d+/.test(s))          return BASE_S3 + 'CAPVD.png';
  if (/^OC-VB\d+/.test(s))          return BASE_S3 + 'CAPVB1DO.png';
  // Mouldings
  if (/^OC-CM/.test(s)||/^CASHMERE-CM/.test(s))  return BASE_S3 + 'CAPCM.png';
  if (/^OC-LM/.test(s)||/^CASHMERE-LM/.test(s))  return BASE_S3 + 'CAPLM.png';
  if (/^OC-SM/.test(s)||/^CASHMERE-SM/.test(s))  return BASE_S3 + 'CAPSM.png';
  if (/^OC-TK/.test(s)||/^CASHMERE-TK/.test(s))  return BASE_S3 + 'CAPTK.png';
  if (/^OC-BM/.test(s))             return BASE_S3 + 'CAPBM.png';
  if (/^OC-TM/.test(s))             return BASE_S3 + 'CAPTM.png';
  if (/^OC-FM/.test(s))             return BASE_S3 + 'CAPFM.png';
  // Fillers & Panels
  if (/^OC-BF\d+/.test(s))          return BASE_S3 + 'CAPABF.png';
  if (/^OC-WF\d+/.test(s))          return BASE_S3 + 'CAPAWF.png';
  if (/^OC-TF\d+/.test(s))          return BASE_S3 + 'CAPATF.png';
  if (/^OC-BDEP/.test(s))           return BASE_S3 + 'CAPABDEP.png';
  if (/^OC-WDEP/.test(s))           return BASE_S3 + 'CAPAWDEP.png';
  if (/^OC-TDEP/.test(s))           return BASE_S3 + 'CAPATDEP24.png';
  if (/^OC-VDEP/.test(s))           return BASE_S3 + 'CAPVDEP.png';
  if (/^CASHMERE-S\d+/.test(s))     return BASE_S3 + 'CAPAS243696.png';
  if (/^CASHMERE-F696/.test(s))     return BASE_S3 + 'CAPA696CUT84.png';
  if (/^CASHMERE-F\d+/.test(s))     return BASE_S3 + 'CAPAF396CUT84.png';
  // Accessories
  if (/^CASHMERE-MCB/.test(s))      return BASE_S3 + 'CAPMCB.png';
  if (/^CASHMERE-CBT/.test(s))      return BASE_S3 + 'CAPCBT.png';
  if (/^CASHMERE-CLDL/.test(s))     return BASE_S3 + 'CAPCLDL.png';
  if (/^CASHMERE-SQDL/.test(s))     return BASE_S3 + 'CAPASQDL.png';
  if (/^CASHMERE-VASH/.test(s))     return BASE_S3 + 'CAPAVASH48.png';
  if (/^RS\d+-TYPEA/.test(s))       return BASE_S3 + 'CAPARS.png';
  if (/^CASHMERE-TUK/.test(s))      return BASE_S3 + 'CAPTUKWHITE.png';
  if (/^CASHMERE-SPRAY/.test(s))    return BASE_S3 + 'spraypaint.png';
  if (/^OC-SAMPLE/.test(s))         return BASE_S3 + 'CAPOCSD.png';
  if (/^OC-B\d+-DISPLAY/.test(s))   return BASE_S3 + 'CAPOCSD.png';
  if (/^CASHMERE-10SWATCH/.test(s)) return BASE_S3 + 'WhiteSwatch10.png';
  if (/^INFIELDKIT/.test(s))        return BASE_S3 + 'CAPIFK.png';
  if (/^UV\d+_GLIDE/.test(s))       return BASE_S3 + 'CAPGLIDE.png';
  if (/^UV_SCHINGE/.test(s))        return BASE_S3 + 'CAPSCHINGE.png';
  if (/^USV\d+|^WSV\d+/.test(s))    return BASE_S3 + 'CAPWSV.png';
  if (/^FPV\d+/.test(s))            return BASE_S3 + 'CAPFPV.png';
  return BASE_S3 + 'OCSDNOB.png';
}

// ─── Dimension parser ─────────────────────────────────────────────────────────
function parseDim(str) {
  if (!str) return null;
  const m = str.match(/([\d]+)(?:-([\d]+)\/([\d]+))?/);
  if (!m) return null;
  const whole = parseInt(m[1]);
  if (m[2] && m[3]) return whole + parseInt(m[2]) / parseInt(m[3]);
  return whole;
}

function parseDimensions(desc) {
  const wm = desc.match(/([\d]+(?:-[\d]+\/[\d]+)?)"W/i);
  const hm = desc.match(/([\d]+(?:-[\d]+\/[\d]+)?)"H/i);
  const dm = desc.match(/([\d]+(?:-[\d]+\/[\d]+)?)"D/i);
  return {
    width:  wm ? parseDim(wm[1]) : null,
    height: hm ? parseDim(hm[1]) : null,
    depth:  dm ? parseDim(dm[1]) : null,
  };
}

// ─── Category → placementType ─────────────────────────────────────────────────
function getPlacementType(category, sku) {
  const s = sku.toUpperCase();
  if (category === 'Base Cabinets') return 'base';
  if (category === 'Wall Cabinets') return 'wall';
  if (category === 'Tall Cabinets') return 'tall';
  if (category === 'Vanities') return 'base';
  return null;
}

// ─── Category → graphicType ───────────────────────────────────────────────────
function getGraphicType(sku) {
  const s = sku.toUpperCase();
  if (/^OC-BT/.test(s))  return 'base_tray';
  if (/^OC-B\d+FH$/.test(s)) {
    const w = parseInt(s.match(/OC-B(\d+)/)?.[1] || '0');
    return w <= 21 ? 'base_1door_fullheight' : 'base_2door_fullheight';
  }
  if (/^OC-SB/.test(s))  return 'base_sink';
  if (/^OC-B\d+DR/.test(s)) return 'base_drawer';
  if (/^OC-B\d+D$/.test(s)) return 'base_2door';
  if (/^OC-B\d+[LR]$/.test(s)) return 'base_1door';
  if (/^OC-B\d+$/.test(s)) return 'base_1door';
  if (/^OC-BBLIND/.test(s)) return 'base_blind';
  if (/^OC-BBC/.test(s)) return 'base_corner';
  if (/^OC-W\d+\d+D$/.test(s)) return 'wall_2door';
  if (/^OC-W\d+/.test(s)) return 'wall_1door';
  if (/^OC-WBLIND/.test(s)) return 'wall_blind';
  if (/^OC-WBC/.test(s)) return 'wall_corner';
  if (/^OC-T\d+/.test(s)) return 'tall_1door';
  if (/^OC-TP/.test(s)) return 'tall_pantry';
  if (/^OC-VB/.test(s)) return 'vanity_1door';
  if (/^OC-VSB/.test(s)) return 'vanity_sink';
  return null;
}

// ─── Parse the collected SKU file ────────────────────────────────────────────
function parseSkuFile(filepath) {
  const lines = readFileSync(filepath, 'utf8').split('\n');
  const skus = [];
  const seen = new Set();
  let currentCategory = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const l = line.toUpperCase();
      if (l.includes('BASE CABINET'))       currentCategory = 'Base Cabinets';
      else if (l.includes('WALL CABINET'))  currentCategory = 'Wall Cabinets';
      else if (l.includes('TALL CABINET'))  currentCategory = 'Tall Cabinets';
      else if (l.includes('VANIT'))         currentCategory = 'Vanities';
      else if (l.includes('MOULDING'))      currentCategory = 'Mouldings';
      else if (l.includes('FILLER') || l.includes('PANEL')) currentCategory = 'Fillers & Panels';
      else if (l.includes('ACCESSOR'))      currentCategory = 'Accessories';
      continue;
    }
    const parts = line.split('|');
    if (parts.length < 3) continue;
    const sku = parts[0].trim();
    if (!sku || seen.has(sku)) continue;
    const price = parseFloat(parts[1].trim());
    if (isNaN(price) || price <= 0) continue;
    const description = parts[2].trim();
    const category = parts[3]?.trim() || currentCategory;
    seen.add(sku);
    skus.push({ sku, price, description, category });
  }
  return skus;
}

// ─── Main import ──────────────────────────────────────────────────────────────
async function main() {
  const conn = await createConnection(process.env.DATABASE_URL);
  const skus = parseSkuFile('/home/ubuntu/oc_skus_collected.txt');
  console.log(`Parsed ${skus.length} SKUs`);

  let insertedCabinets = 0;
  let insertedSkus = 0;
  let skipped = 0;
  const errors = [];

  for (const item of skus) {
    const { sku, price, description, category } = item;
    const dims = parseDimensions(description);
    const imageUrl = getImageUrl(sku);
    const placementType = getPlacementType(category, sku);
    const graphicType = getGraphicType(sku);

    // 1. Insert or get master cabinet
    let cabinetId;
    try {
      const [existing] = await conn.execute(
        'SELECT id FROM cabinets WHERE masterCode = ?',
        [sku]
      );
      if (existing.length > 0) {
        cabinetId = existing[0].id;
        skipped++;
      } else {
        const [result] = await conn.execute(
          `INSERT INTO cabinets
            (masterCode, description, descriptionSource, category, width, height, depth,
             placementType, graphicType, catalogImageUrl, isActive, conflictStatus,
             showInCatalog, showInDesigner, showIn2020, createdAt)
           VALUES (?, ?, 'uscd', ?, ?, ?, ?, ?, ?, ?, 1, 'none', 1, 1, 1, NOW())`,
          [
            sku,
            description,
            category,
            dims.width,
            dims.height,
            dims.depth,
            placementType,
            graphicType,
            imageUrl,
          ]
        );
        cabinetId = result.insertId;
        insertedCabinets++;
      }
    } catch (err) {
      errors.push(`Cabinet ${sku}: ${err.message}`);
      continue;
    }

    // 2. Insert distributor SKU
    const platformSku = `${sku}-OC-USCD`;
    try {
      const [existingSku] = await conn.execute(
        'SELECT id FROM distributor_skus WHERE platformSku = ?',
        [platformSku]
      );
      if (existingSku.length === 0) {
        await conn.execute(
          `INSERT INTO distributor_skus
            (cabinetId, distributorId, styleId, platformSku, distributorSku,
             listPrice, isAvailable, isPublished, imageUrl, status, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, 'approved', NOW())`,
          [
            cabinetId,
            DISTRIBUTOR_ID,
            STYLE_ID,
            platformSku,
            sku,
            price,
            imageUrl,
          ]
        );
        insertedSkus++;
      }
    } catch (err) {
      errors.push(`SKU ${sku}: ${err.message}`);
    }
  }

  await conn.end();

  console.log(`\n=== Oxford Cashmere Import Complete ===`);
  console.log(`  Cabinets inserted: ${insertedCabinets}`);
  console.log(`  Cabinets skipped (already exist): ${skipped}`);
  console.log(`  Distributor SKUs inserted: ${insertedSkus}`);
  if (errors.length > 0) {
    console.log(`  Errors (${errors.length}):`);
    errors.slice(0, 20).forEach(e => console.log(`    - ${e}`));
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
