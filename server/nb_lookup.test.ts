import { describe, it } from 'vitest';
import { getDb } from './db';
import { doorStyles } from '../drizzle/schema';
import { like, or } from 'drizzle-orm';
describe('greek villa lookup', () => {
  it('finds greek villa', async () => {
    const db = await getDb();
    const rows = await db.select().from(doorStyles).where(or(
      like(doorStyles.distributorName, '%Greek%'),
      like(doorStyles.aliasName, '%Greek%'),
      like(doorStyles.styleCode, 'GV')
    ));
    console.log('RESULT ' + JSON.stringify(rows.map((r:any)=>({id:r.id,code:r.styleCode,dist:r.distributorName,our:r.ourName,style:r.doorStyle,distId:r.distributorId})), null, 2));
  });
});
