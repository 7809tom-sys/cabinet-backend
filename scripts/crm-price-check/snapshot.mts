// READ-ONLY fingerprint used before/after a run to prove nothing was written.
import { getDb } from "../../server/db";
import { sql } from "drizzle-orm";
const db: any = await getDb();
const [a]: any = await db.execute(sql`SELECT COUNT(*) n, COALESCE(SUM(estimatedValue),0) s, COALESCE(SUM(designValue),0) dv, MAX(updatedAt) u FROM crm_deals`);
const [b]: any = await db.execute(sql`SELECT COUNT(*) n, COALESCE(MAX(id),0) m FROM design_view_log`);
const [c]: any = await db.execute(sql`SELECT COUNT(*) n, COALESCE(MAX(id),0) m FROM kitchen_designs`);
console.log("SNAPSHOT " + JSON.stringify({ deals: Number(a[0].n), priceSum: String(a[0].s), designValueSum: String(a[0].dv), lastDealUpdate: a[0].u, viewLog: Number(b[0].n), viewLogMaxId: Number(b[0].m), designs: Number(c[0].n), designsMaxId: Number(c[0].m) }));
process.exit(0);
