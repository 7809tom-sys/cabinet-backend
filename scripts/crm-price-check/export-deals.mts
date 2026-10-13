// READ-ONLY. Exports every real CRM deal with its linked designs so the weekly
// price check can compare the deal price to the Designer's current Estimated Total.
// This file must never contain INSERT / UPDATE / DELETE (a test enforces it).
import fs from "fs";
import { getDb } from "../../server/db";
import { sql } from "drizzle-orm";
import { sdk } from "../../server/_core/sdk";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: export-deals.mts <outDir>");
fs.mkdirSync(outDir, { recursive: true });

const db: any = await getDb();
if (!db) throw new Error("database unavailable");

// Leftover AI/QA test rows are never real customers.
const NOT_TEST = sql`NOT (
  COALESCE(d.contactEmail,'') LIKE '%@example.%' OR COALESCE(d.contactEmail,'') LIKE '%.test'
  OR COALESCE(d.contactName,'') LIKE 'Test %' OR d.title LIKE 'PS Test%' OR d.title LIKE 'PS Fee%'
)`;

const [deals]: any = await db.execute(sql`
  SELECT d.id, d.title, d.contactName, d.contactEmail, d.contactPhone, d.affiliateId, a.slug AS affiliateSlug,
         d.estimatedValue, d.designValue, d.updatedAt, d.createdAt
  FROM crm_deals d LEFT JOIN affiliates a ON a.id = d.affiliateId
  WHERE ${NOT_TEST}
  ORDER BY d.id`);
const [links]: any = await db.execute(sql`
  SELECT x.dealId, x.designId, k.name AS designName, k.updatedAt AS designSavedAt, k.userId
  FROM crm_deal_designs x JOIN kitchen_designs k ON k.id = x.designId
  ORDER BY x.dealId, k.updatedAt DESC`);

const byDeal = new Map<number, any[]>();
for (const l of links) { const a = byDeal.get(Number(l.dealId)) ?? []; a.push(l); byDeal.set(Number(l.dealId), a); }
const out = (deals as any[]).map((d) => ({
  id: Number(d.id), title: d.title, name: d.contactName, email: d.contactEmail, phone: d.contactPhone,
  affiliateId: d.affiliateId == null ? null : Number(d.affiliateId), slug: d.affiliateSlug ?? null,
  price: d.estimatedValue == null ? null : Number(d.estimatedValue), designValue: d.designValue == null ? null : Number(d.designValue),
  updatedAt: d.updatedAt, createdAt: d.createdAt,
  designs: (byDeal.get(Number(d.id)) ?? []).map((l) => ({ id: Number(l.designId), name: l.designName, savedAt: l.designSavedAt })),
}));
fs.writeFileSync(`${outDir}/deals.json`, JSON.stringify(out, null, 1));

// Session cookie for the existing admin account so the Designer can open any linked design.
const [adm]: any = await db.execute(sql`SELECT openId, name FROM users WHERE role='admin' ORDER BY id LIMIT 1`);
const token = await sdk.createSessionToken(adm[0].openId, { name: adm[0].name ?? "admin" });
fs.writeFileSync(`${outDir}/token.txt`, token, { mode: 0o600 });

console.log(`EXPORTED deals=${out.length} priced=${out.filter((d) => (d.price ?? 0) > 0).length} withDesigns=${out.filter((d) => d.designs.length).length}`);
process.exit(0);
