import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/cabinet-dealz/.env' });

// Portal uses SW- prefix; our DB uses FW- prefix
// Map: SW-XXX -> FW-XXX (just replace prefix)
const SW_PRICES = {
  "SW-BT09": 96.95,
  "SW-B12": 127.4,
  "SW-B15": 140.7,
  "SW-B18": 155.05,
  "SW-B21": 166.6,
  "SW-B24": 186.55,
  "SW-B27": 205.1,
  "SW-B30": 238.35,
  "SW-B33": 252.35,
  "SW-B36": 265.3,
  "SW-B42": 289.8,
  "SW-BFH12": 97.3,
  "SW-BFH15": 107.8,
  "SW-BFH18": 119.0,
  "SW-BFH21": 129.5,
  "SW-BFH24": 147.7,
  "SW-BFH27": 158.9,
  "SW-BFH30": 171.15,
  "SW-BFH33": 182.7,
  "SW-BFH36": 194.6,
  "SW-2DB24": 232.4,
  "SW-2DB30": 260.75,
  "SW-2DB36": 283.5,
  "SW-3DB12": 191.8,
  "SW-3DB15": 215.6,
  "SW-3DB18": 224.35,
  "SW-3DB21": 238.0,
  "SW-3DB24": 252.35,
  "SW-3DB27": 267.75,
  "SW-3DB33": 297.15,
  "SW-3DB30": 283.15,
  "SW-3DB36": 308.0,
  "SW-SB27": 159.6,
  "SW-SB30": 174.65,
  "SW-SB33": 186.55,
  "SW-SB36": 201.95,
  "SW-FSB36": 201.95,
  "SW-CSB36": 211.05,
  "SW-DCSF42": 80.15,
  "SW-BEC24": 157.15,
  "SW-ERB33": 214.9,
  "SW-ERB36": 238.35,
  "SW-BBC36": 167.65,
  "SW-BBC39": 203.0,
  "SW-BBC42": 233.45,
  "SW-BES12": 102.2,
  "SW-SPB6": 131.25,
  "SW-SPB9": 149.45,
  "SW-BSDC6": 135.45,
  "SW-MB30": 224.35,
  "SW-MB33": 238.0,
  "SW-BWB18": 204.75,
  "SW-DFB18": 169.75,
  "SW-W0930": 67.2,
  "SW-W1230": 74.9,
  "SW-W1530": 87.15,
  "SW-W1830": 97.3,
  "SW-W2130": 105.7,
  "SW-W2430": 131.25,
  "SW-W2730": 140.35,
  "SW-W3030": 157.15,
  "SW-W3330": 167.3,
  "SW-W3630": 178.15,
  "SW-W3930": 188.65,
  "SW-W0936": 74.55,
  "SW-W1236": 86.45,
  "SW-W1536": 97.3,
  "SW-W1836": 110.6,
  "SW-W2136": 124.6,
  "SW-W2436": 141.4,
  "SW-W2736": 152.25,
  "SW-W3036": 174.65,
  "SW-W3336": 190.75,
  "SW-W3636": 202.65,
  "SW-W0942": 84.0,
  "SW-W1242": 100.1,
  "SW-W1542": 115.15,
  "SW-W1842": 131.25,
  "SW-W2142": 146.3,
  "SW-W2442": 165.2,
  "SW-W2742": 180.25,
  "SW-W3042": 207.2,
  "SW-W3342": 220.5,
  "SW-W3642": 234.15,
  "SW-W3012": 85.75,
  "SW-W3312": 91.0,
  "SW-W3612": 96.6,
  "SW-W3015": 94.15,
  "SW-W3315": 100.45,
  "SW-W3615": 106.4,
  "SW-W2418": 100.1,
  "SW-W3018": 106.75,
  "SW-W3318": 109.9,
  "SW-W3618": 114.1,
  "SW-W3024": 128.8,
  "SW-W3324": 131.95,
  "SW-W3624": 141.75,
  "SW-W1530GD": 96.95,
  "SW-W1830GD": 115.15,
  "SW-W1536GD": 110.6,
  "SW-W1836GD": 143.85,
  "SW-W3018GD": 117.25,
  "SW-W1542GD": 127.4,
  "SW-W1842GD": 150.5,
  "SW-W2430GD": 148.05,
  "SW-W3030GD": 175.35,
  "SW-W2436GD": 154.0,
  "SW-W3036GD": 203.0,
  "SW-W2442GD": 182.7,
  "SW-W3042GD": 232.75,
  "SW-W1212GD": 36.05,
  "SW-W1512GD": 40.6,
  "SW-W1812GD": 45.5,
  "SW-W2112GD": 50.05,
  "SW-W2412GD": 60.55,
  "SW-W2712GD": 65.1,
  "SW-W3012GD": 93.1,
  "SW-W3312GD": 99.75,
  "SW-W3612GD": 105.7,
  "SW-W301224": 110.95
};

// Convert SW- prefix to FW- prefix for DB lookup
const FW_PRICES = {};
for (const [swSku, price] of Object.entries(SW_PRICES)) {
  const fwSku = swSku.replace(/^SW-/, 'FW-');
  FW_PRICES[fwSku] = price;
}

const STYLE_ID = 180020; // Floral White

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // First get all existing FW SKUs
  const [existing] = await conn.execute(
    'SELECT id, distributorSku, yourCost FROM distributor_skus WHERE styleId = ? ORDER BY distributorSku',
    [STYLE_ID]
  );
  
  const existingSkus = new Set(existing.map(r => r.distributorSku));
  console.log(`Existing FW SKUs in DB: ${existing.length}`);
  
  let updated = 0;
  let notFound = [];
  
  for (const [fwSku, price] of Object.entries(FW_PRICES)) {
    if (existingSkus.has(fwSku)) {
      await conn.execute(
        'UPDATE distributor_skus SET yourCost = ? WHERE distributorSku = ? AND styleId = ?',
        [price, fwSku, STYLE_ID]
      );
      updated++;
    } else {
      notFound.push(fwSku);
    }
  }
  
  console.log(`Updated: ${updated}`);
  console.log(`Not found in DB (${notFound.length}): ${notFound.join(', ')}`);
  
  // Show which DB SKUs have no portal price
  const portalFwSkus = new Set(Object.keys(FW_PRICES));
  const dbOnlySkus = existing.filter(r => !portalFwSkus.has(r.distributorSku));
  console.log(`\nDB SKUs with no portal price (${dbOnlySkus.length}):`);
  dbOnlySkus.forEach(r => console.log(`  ${r.distributorSku}: $${r.yourCost}`));
  
  await conn.end();
}

main().catch(console.error);
