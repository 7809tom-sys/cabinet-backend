// Script to check which door styles are missing drawerSampleImageUrl
// and attempt to restore from door_style_corrections table
import { getDb } from '../server/db';
import { doorStyles, doorStyleCorrections } from '../drizzle/schema';
import { isNull, isNotNull, eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.error('No DB'); process.exit(1); }

  // Find all styles that have a doorSampleImageUrl but no drawerSampleImageUrl
  const allStyles = await db.select({
    id: doorStyles.id,
    ourName: doorStyles.ourName,
    doorSampleImageUrl: doorStyles.doorSampleImageUrl,
    drawerSampleImageUrl: doorStyles.drawerSampleImageUrl,
  }).from(doorStyles);

  const missing = allStyles.filter(s => s.doorSampleImageUrl && !s.drawerSampleImageUrl);
  const hasBoth = allStyles.filter(s => s.doorSampleImageUrl && s.drawerSampleImageUrl);

  console.log(`\nTotal styles: ${allStyles.length}`);
  console.log(`Has BOTH door + drawer sample: ${hasBoth.length}`);
  console.log(`Has door sample but NO drawer sample: ${missing.length}`);
  console.log('\nMissing drawer sample:');
  missing.forEach(s => console.log(`  [${s.id}] ${s.ourName}`));

  // Check door_style_corrections for any drawer sample images that were submitted
  const corrections = await db.select().from(doorStyleCorrections);
  console.log(`\nCorrections in DB: ${corrections.length}`);
  corrections.forEach(c => {
    console.log(`  [${c.id}] styleId=${c.styleId} type=${c.correctionType} url=${c.proposedImageUrl?.substring(0, 60)}`);
  });
}

main().catch(console.error);
