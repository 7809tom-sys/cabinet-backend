// READ-ONLY. Exports every real CRM deal with its linked designs so the weekly
// price check can compare the deal price to the Designer's current Estimated Total.
// This file must never contain INSERT / UPDATE / DELETE (a test enforces it).
import "dotenv/config";
import fs from "fs";
import { SignJWT } from "jose";
import { getDb } from "../../server/db";
import { sql } from "drizzle-orm";

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

// A short-lived Supabase-style session for the existing admin account so the Designer
// (in the headless browser) can open any linked design. It is signed with the same
// SUPABASE_JWT_SECRET the server verifies, lasts 6 hours, and is deleted after the run.
const [adm]: any = await db.execute(sql`SELECT authId, email, name FROM users WHERE role='admin' AND authId IS NOT NULL AND email IS NOT NULL ORDER BY id LIMIT 1`);
if (!adm[0]) throw new Error("no admin account linked to Supabase Auth (users.authId)");
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
if (!jwtSecret) throw new Error("SUPABASE_JWT_SECRET is required");
const nowSec = Math.floor(Date.now() / 1000);
const expSec = nowSec + 6 * 3600;
const appMetadata = { provider: "email", providers: ["email"] };
const accessToken = await new SignJWT({ email: adm[0].email, role: "authenticated", aal: "aal1", app_metadata: appMetadata, user_metadata: { name: adm[0].name ?? "admin" } })
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setSubject(adm[0].authId)
  .setAudience("authenticated")
  .setIssuedAt(nowSec)
  .setExpirationTime(expSec)
  .sign(new TextEncoder().encode(jwtSecret));
const session = {
  access_token: accessToken, token_type: "bearer", expires_in: expSec - nowSec, expires_at: expSec,
  refresh_token: "crm-price-check-no-refresh",
  user: { id: adm[0].authId, aud: "authenticated", role: "authenticated", email: adm[0].email, app_metadata: appMetadata, user_metadata: {} },
};
fs.writeFileSync(`${outDir}/session.json`, JSON.stringify(session), { mode: 0o600 });

console.log(`EXPORTED deals=${out.length} priced=${out.filter((d) => (d.price ?? 0) > 0).length} withDesigns=${out.filter((d) => d.designs.length).length}`);
process.exit(0);
