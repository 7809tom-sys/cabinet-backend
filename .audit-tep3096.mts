import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';
const db=await mysql.createConnection(process.env.DATABASE_URL!);
const [[settings]]:any=await db.query(`SELECT homeownerMarkupBps,contractorMarkupBps,wholesaleMarkupBps FROM pricing_settings ORDER BY id LIMIT 1`);
const [masters]:any=await db.query(`SELECT c.id,c.masterCode,c.description,c.category,c.subCategory,c.width,c.height,c.depth,c.placementType,c.isNotCabinet,c.isActive,c.showInCatalog,c.showInDesigner,c.showIn2020,o.width overrideWidth,o.height overrideHeight,o.depth overrideDepth,o.imageUrl,o.configJson FROM cabinets c JOIN distributors d ON d.code='AEF' LEFT JOIN distributor_cabinet_overrides o ON o.distributorId=d.id AND o.cabinetId=c.id WHERE c.masterCode='TEP3096'`);
const [skus]:any=await db.query(`SELECT ds.distributorSku,st.styleCode,ds.listPrice,ds.yourCost,ds.wholesalePrice,ds.contractorPrice,ds.homeownerPrice,ds.isAvailable,ds.isPublished,ds.geometryWidth,ds.geometryHeight,ds.geometryDepth,ds.geometryToeKickHeight,ds.geometrySourcePage,ds.geometryStatus,ds.constructionType,ds.imageUrl,ds.supplierDescription FROM distributor_skus ds JOIN distributors d ON d.id=ds.distributorId JOIN door_styles st ON st.id=ds.styleId WHERE d.code='AEF' AND ds.distributorSku='TEP3096' ORDER BY st.styleCode`);
function cents(n:string|number){return Math.round(Number(n)*100)}
function half(n:number){return Math.round((n+Number.EPSILON)*100)/100}
const expectedLists:{[k:string]:number}={TWP:482,PGW:994,SSA:910,LSA:1260,LSP:1305,SCA:910,ZCC:1260};
const aliases:{[k:string]:string}={TGW:'TWP',TDW:'TWP',SSD:'SSA',SSE:'SSA',SSH:'SSA',SSJ:'SSA',SSK:'SSA',SSL:'SSA',SSM:'SSA',SSN:'SSA',SSO:'SSA',SSP:'SSA',SSQ:'SSA',SSR:'SSA',SSS:'SSA',SSV:'SSA',SSX:'SSA',SSZ:'SSA',LSC:'LSA',LSN:'LSA',ZSA:'LSA',ZSB:'LSA',ZSC:'LSA',ZSI:'LSA',ZSK:'LSA',ZSL:'LSA',ZSM:'LSA',ZSN:'LSA',ZSO:'LSA',ZSP:'LSA',ZSU:'LSA',ZSV:'LSA',ZSW:'LSA',LSR:'LSP',SCL:'SCA',SCM:'SCA',SCN:'SCA',SCQ:'SCA',SCR:'SCA',SCZ:'SCA',ZCK:'ZCC',ZCN:'ZCC'};
const expected=(style:string)=>expectedLists[aliases[style]??style];
const priceMismatches=skus.filter((r:any)=>{const list=expected(r.styleCode); if(!list)return true; const cost=half(half(list*.23)*1.07); return cents(r.listPrice)!==cents(list)||cents(r.yourCost)!==cents(cost)||cents(r.homeownerPrice)!==cents(half(cost*1.58));});
const summary={settings,master:masters[0]??null,skuCount:skus.length,allAvailablePublished:skus.every((r:any)=>Number(r.isAvailable)===1&&Number(r.isPublished)===1),priceMismatches,examples:skus.filter((r:any)=>['TWP','PGW','SSA','LSA','LSP','SCA','ZCC'].includes(r.styleCode))};
console.log(JSON.stringify(summary,null,2));await db.end();
