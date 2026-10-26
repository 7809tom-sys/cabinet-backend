import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [r] = await c.query("SELECT styleCode,distributorName,aliasName,woodSpecies,finish,color,overlayType,doorPanelType,isBuilderGrade,isActive FROM door_styles WHERE distributorId=2 AND styleCode IN ('ASP','WPG') ORDER BY styleCode");
console.log(JSON.stringify(r,null,1));
await c.end();
