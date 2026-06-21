import "dotenv/config";
import mysql from "mysql2/promise";
const lc=(v)=>(v??"").toString().toLowerCase();
const toNum=(v)=>{if(v==null)return null;const n=typeof v==="number"?v:parseFloat(v);return Number.isFinite(n)?n:null;};
const conn=await mysql.createConnection(process.env.DATABASE_URL);
const [rows]=await conn.execute(`SELECT masterCode,description,category,subCategory,width,height,depth,numberOfDoors AS doors FROM cabinets ORDER BY category,subCategory,masterCode`);
await conn.end();
const out=[];
for(const r of rows){
  const desc=lc(r.description),sub=lc(r.subCategory),w=toNum(r.width),h=toNum(r.height),d=toNum(r.depth);
  const f=[];
  if(/drawer front/.test(desc)&&h&&h>12)f.push(`drawer-front desc but H=${h}"`);
  if(/(end panel|dishwasher|return panel|skin)/.test(desc)&&/(single door base|double door)/.test(sub))f.push(`panel desc but subCat="${r.subCategory}"`);
  if(h&&h>120)f.push(`H=${h}" typo`);
  if(w&&w>120)f.push(`W=${w}" typo`);
  if(!w&&!h&&!d)f.push("no dims");
  if(f.length)out.push(`${r.masterCode}  [${r.category}/${r.subCategory}]  "${r.description}"  -> ${f.join("; ")}`);
}
console.log(out.join("\n"));
console.log("\nTOTAL FLAGGED:",out.length);
