// Update Floral Espresso (FE) prices from Milestone portal Shaker Espresso page
// Portal uses SE- prefix, our DB uses FE- prefix
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const seData = [{"sku":"SE-BT09","price":"$101.15"},{"sku":"SE-B12","price":"$131.60"},{"sku":"SE-B15","price":"$149.10"},{"sku":"SE-B18","price":"$160.30"},{"sku":"SE-B21","price":"$177.10"},{"sku":"SE-B24","price":"$192.85"},{"sku":"SE-B27","price":"$214.55"},{"sku":"SE-B30","price":"$250.95"},{"sku":"SE-B33","price":"$263.55"},{"sku":"SE-B36","price":"$281.75"},{"sku":"SE-B42","price":"$301.00"},{"sku":"SE-BFH12","price":"$102.20"},{"sku":"SE-BFH15","price":"$113.40"},{"sku":"SE-BFH18","price":"$124.60"},{"sku":"SE-BFH21","price":"$135.80"},{"sku":"SE-BFH24","price":"$154.70"},{"sku":"SE-BFH27","price":"$166.95"},{"sku":"SE-BFH30","price":"$179.55"},{"sku":"SE-BFH33","price":"$191.80"},{"sku":"SE-BFH36","price":"$204.05"},{"sku":"SE-2DB24","price":"$244.30"},{"sku":"SE-2DB30","price":"$274.05"},{"sku":"SE-2DB36","price":"$297.85"},{"sku":"SE-3DB12","price":"$197.05"},{"sku":"SE-3DB15","price":"$221.90"},{"sku":"SE-3DB18","price":"$235.90"},{"sku":"SE-3DB21","price":"$242.90"},{"sku":"SE-3DB27","price":"$277.20"},{"sku":"SE-3DB33","price":"$308.35"},{"sku":"SE-3DB24","price":"$256.55"},{"sku":"SE-3DB30","price":"$297.50"},{"sku":"SE-3DB36","price":"$326.90"},{"sku":"SE-SB27","price":"$168.00"},{"sku":"SE-SB30","price":"$184.10"},{"sku":"SE-SB33","price":"$196.70"},{"sku":"SE-SB36","price":"$213.50"},{"sku":"SE-FSB36","price":"$213.50"},{"sku":"SE-CSB36","price":"$223.30"},{"sku":"SE-DCSF42","price":"$85.75"},{"sku":"SE-BEC24","price":"$167.30"},{"sku":"SE-ERB33","price":"$225.75"},{"sku":"SE-ERB36","price":"$252.00"},{"sku":"SE-BBC36","price":"$177.10"},{"sku":"SE-BBC39","price":"$215.25"},{"sku":"SE-BBC42","price":"$243.95"},{"sku":"SE-BES12","price":"$107.10"},{"sku":"SE-SPB9","price":"$157.15"},{"sku":"SE-BSDC6","price":"$142.80"},{"sku":"SE-MB30","price":"$237.65"},{"sku":"SE-MB33","price":"$251.30"},{"sku":"SE-BWB18","price":"$214.90"},{"sku":"SE-DFB18","price":"$182.00"},{"sku":"SE-W0930","price":"$70.35"},{"sku":"SE-W1230","price":"$79.45"},{"sku":"SE-W1530","price":"$92.05"},{"sku":"SE-W1830","price":"$106.75"},{"sku":"SE-W2130","price":"$117.60"},{"sku":"SE-W2430","price":"$137.90"},{"sku":"SE-W2730","price":"$150.85"},{"sku":"SE-W3030","price":"$166.60"},{"sku":"SE-W3330","price":"$175.35"},{"sku":"SE-W3630","price":"$191.10"},{"sku":"SE-W3930","price":"$198.10"},{"sku":"SE-W0936","price":"$76.65"},{"sku":"SE-W1236","price":"$91.35"},{"sku":"SE-W1536","price":"$105.70"},{"sku":"SE-W1836","price":"$123.90"},{"sku":"SE-W2136","price":"$138.95"},{"sku":"SE-W2436","price":"$161.70"},{"sku":"SE-W2736","price":"$174.30"},{"sku":"SE-W3036","price":"$190.75"},{"sku":"SE-W3336","price":"$206.85"},{"sku":"SE-W3636","price":"$220.85"},{"sku":"SE-W0942","price":"$90.65"},{"sku":"SE-W1242","price":"$105.35"},{"sku":"SE-W1542","price":"$123.90"},{"sku":"SE-W1842","price":"$141.40"},{"sku":"SE-W2142","price":"$155.05"},{"sku":"SE-W2442","price":"$188.65"},{"sku":"SE-W2742","price":"$194.25"},{"sku":"SE-W3042","price":"$221.20"},{"sku":"SE-W3342","price":"$235.90"},{"sku":"SE-W3642","price":"$252.70"},{"sku":"SE-W3012","price":"$91.35"},{"sku":"SE-W3312","price":"$95.90"},{"sku":"SE-W3612","price":"$101.50"},{"sku":"SE-W3015","price":"$102.55"},{"sku":"SE-W3315","price":"$105.70"},{"sku":"SE-W3615","price":"$109.20"},{"sku":"SE-W2418","price":"$100.45"},{"sku":"SE-W3018","price":"$112.70"},{"sku":"SE-W3318","price":"$116.20"},{"sku":"SE-W3618","price":"$122.15"},{"sku":"SE-W3024","price":"$135.80"},{"sku":"SE-W3324","price":"$138.60"},{"sku":"SE-W3624","price":"$159.25"},{"sku":"SE-W1530GD","price":"$104.65"},{"sku":"SE-W1830GD","price":"$121.80"},{"sku":"SE-W1536GD","price":"$119.00"},{"sku":"SE-W1836GD","price":"$145.60"},{"sku":"SE-W3018GD","price":"$123.90"},{"sku":"SE-W1542GD","price":"$136.50"},{"sku":"SE-W1842GD","price":"$160.65"},{"sku":"SE-W2430GD","price":"$155.05"},{"sku":"SE-W3030GD","price":"$183.75"},{"sku":"SE-W2436GD","price":"$161.35"},{"sku":"SE-W3036GD","price":"$214.55"},{"sku":"SE-W2442GD","price":"$206.15"},{"sku":"SE-W3042GD","price":"$245.00"},{"sku":"SE-W1212GD","price":"$41.65"},{"sku":"SE-W1512GD","price":"$46.90"},{"sku":"SE-W1812GD","price":"$53.90"},{"sku":"SE-W2112GD","price":"$59.15"},{"sku":"SE-W2412GD","price":"$72.10"},{"sku":"SE-W2712GD","price":"$78.40"},{"sku":"SE-W3012GD","price":"$98.70"},{"sku":"SE-W3312GD","price":"$104.65"},{"sku":"SE-W3612GD","price":"$110.95"},{"sku":"SE-W301224","price":"$116.20"},{"sku":"SE-W301524","price":"$126.00"}];

const conn = await createConnection(process.env.DATABASE_URL);

let updated = 0, notFound = 0, skipped = 0;
const notFoundList = [];

for (const item of seData) {
  const price = parseFloat(item.price.replace('$', ''));
  if (!price || price <= 0) { skipped++; continue; }
  
  // Convert SE- prefix to FE- prefix
  const feSku = item.sku.replace(/^SE-/, 'FE-');
  
  const [rows] = await conn.execute(
    'UPDATE distributor_skus SET yourCost = ? WHERE distributorSku = ? AND isAvailable = 1',
    [price, feSku]
  );
  
  if (rows.affectedRows > 0) {
    updated++;
  } else {
    notFound++;
    notFoundList.push(feSku);
  }
}

await conn.end();
console.log(`Updated: ${updated}, Not found: ${notFound}, Skipped: ${skipped}`);
if (notFoundList.length > 0) {
  console.log('Not found SKUs:', notFoundList.slice(0, 20).join(', '));
}
