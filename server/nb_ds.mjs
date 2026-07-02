import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [cols] = await conn.query("SHOW COLUMNS FROM door_styles");
console.log(cols.map(c=>c.Field+':'+c.Type+(c.Null==='NO'?' NOTNULL':'')+(c.Default!=null?` def=${c.Default}`:'')).join("\n"));
const [mx] = await conn.query("SELECT MAX(id) mx FROM door_styles");
console.log("MAX door_styles id:", mx[0].mx);
const [dn] = await conn.query("SELECT * FROM door_styles WHERE styleCode='DN' AND distributorId=2");
console.log("existing DN door_styles rows:", dn.length);
// show an existing distId2 door_styles row (RH) to mirror fields
const [rh] = await conn.query("SELECT * FROM door_styles WHERE id=30062");
console.log("RH row (30062):", JSON.stringify(rh[0], null, 2));
await conn.end();
