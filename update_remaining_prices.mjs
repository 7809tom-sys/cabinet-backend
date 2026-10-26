import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from cabinet-dealz project
dotenv.config({ path: join(__dirname, 'cabinet-dealz', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

// Prices extracted from USCD Quick Order (dealer prices)
// These are the actual dealer prices logged in as sales@firstclasscabinetwholesale.com
const prices = [
  { sku: 'W3612',   dealerPrice: 94.99 },
  { sku: 'VDEP',    dealerPrice: 52.67 },
  { sku: 'U309624', dealerPrice: 488.98 },
  { sku: 'U309024', dealerPrice: 465.06 },
  { sku: 'U308424', dealerPrice: 446.43 },
  { sku: 'U249624', dealerPrice: 455.86 },
  { sku: 'U249024', dealerPrice: 434.24 },
  { sku: 'U189624', dealerPrice: 382.49 },
  { sku: 'U189024', dealerPrice: 365.47 },
  { sku: 'U188424', dealerPrice: 353.51 },
  { sku: 'LSB36',   dealerPrice: 74.80 },  // rounded from 74.8006
  { sku: 'LSB33',   dealerPrice: 69.67 },  // rounded from 69.6693
  { sku: 'B36FH',   dealerPrice: 87.29 },  // rounded from 87.285
  { sku: 'B33FH',   dealerPrice: 81.68 },  // rounded from 81.6776
  { sku: 'B30FH',   dealerPrice: 73.90 },  // rounded from 73.9013
];

async function main() {
  const connection = await mysql.createConnection(DATABASE_URL);
  
  console.log('Connected to database');
  console.log(`Updating ${prices.length} SKU prices...\n`);
  
  let updated = 0;
  let notFound = 0;
  
  for (const { sku, dealerPrice } of prices) {
    // Update distributor_skus where distributorSku matches (with SU- prefix stripped)
    // The DB stores SKUs without the SU- prefix
    const [result] = await connection.execute(
      `UPDATE distributor_skus 
       SET listPrice = ?, yourCost = ?, status = 'approved'
       WHERE distributorSku = ? AND status = 'approved'`,
      [dealerPrice, dealerPrice, sku]
    );
    
    if (result.affectedRows > 0) {
      console.log(`✓ Updated ${sku}: $${dealerPrice} (${result.affectedRows} rows)`);
      updated += result.affectedRows;
    } else {
      // Try to find it regardless of status
      const [rows] = await connection.execute(
        `SELECT distributorSku, listPrice, yourCost, status FROM distributor_skus WHERE distributorSku = ? LIMIT 5`,
        [sku]
      );
      if (rows.length > 0) {
        console.log(`⚠ Found ${sku} but status is not 'approved': ${JSON.stringify(rows)}`);
        // Update anyway
        const [r2] = await connection.execute(
          `UPDATE distributor_skus 
           SET listPrice = ?, yourCost = ?, status = 'approved'
           WHERE distributorSku = ?`,
          [dealerPrice, dealerPrice, sku]
        );
        if (r2.affectedRows > 0) {
          console.log(`  → Force-updated ${sku}: $${dealerPrice} (${r2.affectedRows} rows)`);
          updated += r2.affectedRows;
        }
      } else {
        console.log(`✗ SKU not found in DB: ${sku}`);
        notFound++;
      }
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated} rows`);
  console.log(`Not found: ${notFound} SKUs`);
  
  // Verify the updates
  console.log('\n=== Verification ===');
  const skuList = prices.map(p => `'${p.sku}'`).join(', ');
  const [verifyRows] = await connection.execute(
    `SELECT distributorSku, listPrice, yourCost, status 
     FROM distributor_skus 
     WHERE distributorSku IN (${skuList})
     ORDER BY distributorSku`
  );
  
  for (const row of verifyRows) {
    console.log(`${row.distributorSku}: listPrice=$${row.listPrice}, yourCost=$${row.yourCost}, status=${row.status}`);
  }
  
  await connection.end();
}

main().catch(console.error);
