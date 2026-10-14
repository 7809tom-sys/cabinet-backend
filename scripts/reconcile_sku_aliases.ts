import { getDb } from "../server/db";
import { eq } from "drizzle-orm";
import { cabinets, cabinetAliases, skuMasterAliases, cabinetCodeEquivalences, distributorSkus } from "../drizzle/schema";

const norm = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/[- _]/g, "");
const clean = (v: unknown) => String(v ?? "").trim();

async function main() {
  const db = await getDb(); if (!db) throw new Error("DATABASE_URL is not available");
  const [rows, cabinetAliasRows, aliasRows, equivalences, suppliers] = await Promise.all([
    db.select().from(cabinets), db.select().from(cabinetAliases), db.select().from(skuMasterAliases), db.select().from(cabinetCodeEquivalences), db.select({ cabinetId: distributorSkus.cabinetId }).from(distributorSkus),
  ]);
  const parent = new Map<string,string>(); const variants = new Map<string,Set<string>>();
  const add = (value: unknown) => { const code=clean(value); if(!code) return ""; const key=norm(code); if(!parent.has(key)) parent.set(key,key); (variants.get(key) ?? variants.set(key,new Set()).get(key)!).add(code); return key; };
  const find=(x:string):string=>{ let p=parent.get(x)??x; while(parent.get(p)&&parent.get(p)!==p)p=parent.get(p)!; parent.set(x,p); return p; };
  const union=(a:unknown,b:unknown)=>{const ak=add(a),bk=add(b);if(!ak||!bk)return;const ar=find(ak),br=find(bk);if(ar!==br)parent.set(br,ar);};
  rows.forEach(r=>add(r.masterCode)); aliasRows.forEach(r=>union(r.aliasCode,r.masterCode)); cabinetAliasRows.forEach(r=>union(r.alias,rows.find(c=>c.id===r.cabinetId)?.masterCode)); equivalences.filter(r=>r.isActive).forEach(r=>union(r.codeA,r.codeB));
  const rowByNorm=new Map<string,typeof rows[number]>(); rows.forEach(r=>rowByNorm.set(norm(r.masterCode),r));
  const byRoot=new Map<string,typeof rows>(); rows.forEach(r=>{const root=find(norm(r.masterCode));(byRoot.get(root)??byRoot.set(root,[]).get(root)!).push(r);});
  const codesByRoot=new Map<string,Set<string>>(); for(const [key,set] of variants){const root=find(key);const target=codesByRoot.get(root)??codesByRoot.set(root,new Set()).get(root)!;for(const code of set)target.add(code);}
  const degree=new Map<string,number>(); for(const r of aliasRows){if(r.conflictStatus!=="ok")continue;for(const c of [r.aliasCode,r.masterCode])degree.set(norm(c),(degree.get(norm(c))??0)+1);} for(const r of cabinetAliasRows){const target=rows.find(c=>c.id===r.cabinetId);for(const c of [r.alias,target?.masterCode])degree.set(norm(c),(degree.get(norm(c))??0)+1);}
  const supplierCount=new Map<number,number>();for(const r of suppliers)supplierCount.set(r.cabinetId,(supplierCount.get(r.cabinetId)??0)+1);
  const decisions=[] as any[];
  for(const [root,componentRows] of byRoot){const ranked=componentRows.slice().sort((a,b)=>{
    const av=degree.get(norm(a.masterCode))??0,bv=degree.get(norm(b.masterCode))??0;
    return bv-av || (supplierCount.get(b.id)??0)-(supplierCount.get(a.id)??0) || Number(b.isActive)-Number(a.isActive) || Number(b.showInCatalog||b.showInDesigner)-Number(a.showInCatalog||a.showInDesigner) || a.masterCode.localeCompare(b.masterCode);
  }); const master=ranked[0]; decisions.push({root,masterId:master.id,masterCode:master.masterCode,aliasCodes:[...(codesByRoot.get(root)??new Set())].filter(c=>norm(c)!==norm(master.masterCode)),componentRows:componentRows.map(r=>({id:r.id,code:r.masterCode,degree:degree.get(norm(r.masterCode))??0,suppliers:supplierCount.get(r.id)??0}))});}
  if (process.argv.includes("--apply")) {
    await db.transaction(async tx=>{
      for(const d of decisions){
        const componentCodes = new Set(d.componentRows.map((r: { code: string }) => norm(r.code)));
        for (const existing of aliasRows.filter(r => componentCodes.has(norm(r.aliasCode)))) {
          await tx.update(skuMasterAliases).set({masterCode:d.masterCode,conflictStatus:"ok",notes:"Direct canonical alias after complete master/alias graph reconciliation."}).where(eq(skuMasterAliases.id,existing.id));
        }
        for(const aliasCode of d.aliasCodes){
          const existing=aliasRows.find(r=>r.aliasCode===aliasCode);
          if(!existing) await tx.insert(skuMasterAliases).values({aliasCode,masterCode:d.masterCode,conflictStatus:"ok",notes:"Direct canonical alias after complete master/alias graph reconciliation."}).onDuplicateKeyUpdate({set:{masterCode:d.masterCode,conflictStatus:"ok",notes:"Direct canonical alias after complete master/alias graph reconciliation."}});
          const cabinet=rowByNorm.get(norm(aliasCode)); if(cabinet && norm(aliasCode) !== norm(d.masterCode)) await tx.insert(cabinetAliases).values({cabinetId:d.masterId,alias:aliasCode}).onDuplicateKeyUpdate({set:{cabinetId:d.masterId}});
        }
      }
    });
  }
  console.log(JSON.stringify({componentCount:decisions.length, decisions},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
