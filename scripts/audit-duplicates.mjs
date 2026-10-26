/**
 * Audit duplicate cabinets and generate merge SQL.
 * 
 * Strategy:
 * 1. Find all cabinets where altSku1/2/3 matches another cabinet's masterCode
 * 2. The 939xxxx range (Ashford/Clark and Son) is the source of truth
 * 3. Merge SKUs from duplicates into the Ashford row
 * 4. Deactivate the duplicate
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load env from .project-config.json
const configPath = resolve('/home/ubuntu/cabinet-dealz/.project-config.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const dbUrl = config.env_vars.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await mysql.createConnection(dbUrl);

// Get all active cabinets
const [rows] = await conn.execute(`
  SELECT id, masterCode, altSku1, altSku2, altSku3, configuredAt, description, category
  FROM cabinets 
  WHERE isActive = 1
  ORDER BY id
`);

console.log(`Total active cabinets: ${rows.length}`);

// Build a map of masterCode -> cabinet
const byCode = new Map();
for (const r of rows) {
  byCode.set(r.masterCode, r);
}

// Find duplicates: where a cabinet's alias points to another active cabinet's masterCode
const duplicatePairs = []; // { keep, dupe }
const processed = new Set();

for (const r of rows) {
  const aliases = [r.altSku1, r.altSku2, r.altSku3].filter(Boolean);
  for (const alias of aliases) {
    const other = byCode.get(alias);
    if (other && other.id !== r.id && !processed.has(`${Math.min(r.id, other.id)}-${Math.max(r.id, other.id)}`)) {
      processed.add(`${Math.min(r.id, other.id)}-${Math.max(r.id, other.id)}`);
      
      // Decide which to keep: prefer 939xxxx (Ashford) range, or the one with configuredAt
      let keep, dupe;
      const rIsAshford = r.id >= 9390000 && r.id < 9400000;
      const otherIsAshford = other.id >= 9390000 && other.id < 9400000;
      
      if (rIsAshford && !otherIsAshford) {
        keep = r; dupe = other;
      } else if (otherIsAshford && !rIsAshford) {
        keep = other; dupe = r;
      } else if (r.configuredAt && !other.configuredAt) {
        keep = r; dupe = other;
      } else if (other.configuredAt && !r.configuredAt) {
        keep = other; dupe = r;
      } else {
        // Both same range, keep the one with lower ID (first created)
        keep = r.id < other.id ? r : other;
        dupe = r.id < other.id ? other : r;
      }
      
      duplicatePairs.push({ keep, dupe });
    }
  }
}

console.log(`\nFound ${duplicatePairs.length} duplicate pairs to merge:\n`);

// Also check for cabinets that match by normalized code (remove hyphens)
const normalizeCode = (code) => code.replace(/-/g, '').toUpperCase();
const byNormalized = new Map();
const additionalDupes = [];

for (const r of rows) {
  const norm = normalizeCode(r.masterCode);
  if (byNormalized.has(norm)) {
    const existing = byNormalized.get(norm);
    const pairKey = `${Math.min(r.id, existing.id)}-${Math.max(r.id, existing.id)}`;
    if (!processed.has(pairKey)) {
      processed.add(pairKey);
      let keep, dupe;
      const rIsAshford = r.id >= 9390000 && r.id < 9400000;
      const existingIsAshford = existing.id >= 9390000 && existing.id < 9400000;
      
      if (rIsAshford && !existingIsAshford) {
        keep = r; dupe = existing;
      } else if (existingIsAshford && !rIsAshford) {
        keep = existing; dupe = r;
      } else if (r.configuredAt && !existing.configuredAt) {
        keep = r; dupe = existing;
      } else if (existing.configuredAt && !r.configuredAt) {
        keep = existing; dupe = r;
      } else {
        keep = r.id < existing.id ? r : existing;
        dupe = r.id < existing.id ? existing : r;
      }
      additionalDupes.push({ keep, dupe });
    }
  } else {
    byNormalized.set(norm, r);
  }
}

console.log(`Found ${additionalDupes.length} additional duplicates by normalized code (hyphen removal):\n`);

const allDupes = [...duplicatePairs, ...additionalDupes];
console.log(`\nTOTAL duplicates to merge: ${allDupes.length}`);
console.log(`Expected final count: ${rows.length - allDupes.length} active cabinets\n`);

// Generate SQL
const sqlStatements = [];
for (const { keep, dupe } of allDupes) {
  // Move SKUs
  sqlStatements.push(`-- Merge ${dupe.masterCode} (${dupe.id}) into ${keep.masterCode} (${keep.id})`);
  sqlStatements.push(`UPDATE distributor_skus SET cabinetId = ${keep.id} WHERE cabinetId = ${dupe.id};`);
  // Move overrides
  sqlStatements.push(`UPDATE distributor_cabinet_overrides SET cabinetId = ${keep.id} WHERE cabinetId = ${dupe.id};`);
  // Deactivate and hide dupe
  sqlStatements.push(`UPDATE cabinets SET isActive = 0, showInDesigner = 0, showInCatalog = 0 WHERE id = ${dupe.id};`);
  // Set alias on keep if not already there
  sqlStatements.push(`UPDATE cabinets SET altSku1 = '${dupe.masterCode}' WHERE id = ${keep.id} AND altSku1 IS NULL;`);
  sqlStatements.push('');
}

// Print summary
console.log('=== MERGE PLAN ===');
for (const { keep, dupe } of allDupes) {
  console.log(`  KEEP: ${keep.masterCode} (${keep.id}) | DEACTIVATE: ${dupe.masterCode} (${dupe.id})`);
}

// Write SQL file
const sqlContent = sqlStatements.join('\n');
const fs = await import('fs');
fs.writeFileSync('/home/ubuntu/cabinet-dealz/scripts/merge-duplicates.sql', sqlContent);
console.log(`\nSQL written to scripts/merge-duplicates.sql`);

await conn.end();
