import { getDb } from '../server/db';
import { cabinets, skuMasterAliases } from '../drizzle/schema';
async function main(){
 const db=await getDb(); if(!db) throw new Error('no db');
 const [cs,as]=await Promise.all([db.select({masterCode:cabinets.masterCode}).from(cabinets),db.select({aliasCode:skuMasterAliases.aliasCode,masterCode:skuMasterAliases.masterCode,conflictStatus:skuMasterAliases.conflictStatus}).from(skuMasterAliases)]);
 const codes=new Set(cs.map(c=>c.masterCode)); const aliasMap=new Map(as.map(a=>[a.aliasCode,a.masterCode]));
 const missing=as.filter(a=>!codes.has(a.masterCode));
 const chains=as.filter(a=>a.aliasCode!==a.masterCode && aliasMap.has(a.masterCode) && aliasMap.get(a.masterCode)!==a.masterCode);
 const conflicts=as.filter(a=>a.conflictStatus!=='ok');
 console.log(JSON.stringify({cabinetRows:cs.length,skuAliases:as.length,missingMasterCount:missing.length,missingMaster:missing,aliasChainCount:chains.length,aliasChains:chains.slice(0,50),conflictCount:conflicts.length},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
