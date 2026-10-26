import mysql from 'mysql2/promise';
const db=await mysql.createConnection(process.env.DATABASE_URL!);
const codes=['BEP2535','WEP1523','WEP1530','WEP1535','WEP1542'];
const [masters]=await db.query(`SELECT id,masterCode,description,category,subCategory,width,height,depth,placementType,isActive,showInCatalog,showInDesigner,isNotCabinet FROM cabinets WHERE masterCode IN (${codes.map(()=>'?').join(',')}) ORDER BY masterCode`,codes);
const [skuRows]=await db.query(`SELECT d.code distributor,ds.distributorSku,c.masterCode,st.styleCode,ds.listPrice,ds.yourCost,ds.homeownerPrice,ds.isPublished,ds.isAvailable,ds.geometryWidth,ds.geometryHeight,ds.geometryDepth,ds.geometrySourcePage FROM distributor_skus ds JOIN cabinets c ON c.id=ds.cabinetId JOIN distributors d ON d.id=ds.distributorId JOIN door_styles st ON st.id=ds.styleId WHERE c.masterCode IN (${codes.map(()=>'?').join(',')}) ORDER BY c.masterCode,d.code,st.styleCode`,codes);
console.log(JSON.stringify({masters,skuRows},null,2)); await db.end();
