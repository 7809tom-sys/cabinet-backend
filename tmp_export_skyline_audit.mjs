import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [d] = await conn.query("SELECT id, code, name, brandName, whiteLabel, displayMode FROM distributors WHERE brandName LIKE '%Skyline%' OR name LIKE '%Skyline%' OR code LIKE '%SKY%'");
console.log('DISTRIBUTORS\n'+JSON.stringify(d,null,2));
const ids=d.map(x=>x.id);
if(ids.length){
 const inq=ids.map(()=>'?').join(',');
 const [styles]=await conn.query(`SELECT id, distributorId, styleCode, ourName, aliasName, distributorName, doorStyle, woodSpecies, finish, color, boxConstruction, drawerConstruction, frameSize, overlayType, doorPanelType FROM door_styles WHERE distributorId IN (${inq}) ORDER BY distributorId,id`,ids);
 console.log('STYLES\n'+JSON.stringify(styles,null,2));
 const [rows]=await conn.query(`SELECT c.id,c.masterCode,c.description,c.category,c.subCategory,c.width,c.height,c.depth,c.numberOfDoors,c.numberOfDrawers,c.numberOfFixedShelves,c.numberOfAdjShelves,c.placementType,c.constructionMethod,c.cabinetStyle,c.productType,c.doorOrientation,c.doorsPerRow,c.drawerLayout,c.layoutSpec,c.glassDoorAddonCode, ds.distributorId, ds.styleId, ds.distributorSku, ds.platformSku, ds.supplierCabinetName, ds.supplierDescription, ds.isAvailable, ds.isPublished FROM cabinets c JOIN distributor_skus ds ON ds.cabinetId=c.id WHERE ds.distributorId IN (${inq}) ORDER BY c.masterCode,ds.styleId`,ids);
 console.log('ROWS\n'+JSON.stringify(rows,null,2));
}
await conn.end();
