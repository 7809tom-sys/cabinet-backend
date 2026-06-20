import mysql from "mysql2/promise";
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await c.query("SELECT id, name, code FROM distributors ORDER BY id");
console.log(JSON.stringify(rows));
await c.end();
