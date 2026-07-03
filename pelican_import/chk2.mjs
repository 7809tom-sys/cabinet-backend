import mysql from "mysql2/promise";
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [chk] = await c.query("SELECT category, SUM(isPopular) pop, COUNT(*) n FROM pelican_products GROUP BY category ORDER BY pop DESC");
console.table(chk);
const [pop] = await c.query("SELECT name, category, subCategory, listPrice FROM pelican_products WHERE isPopular=1 AND category IN (\"Sinks & Faucets\",\"Flooring\") ORDER BY category, popularRank");
console.table(pop);
await c.end();
