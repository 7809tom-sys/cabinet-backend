import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const [,user,password,host,port,database] = match;

const conn = await createConnection({
  host, port: parseInt(port), user, password, database,
  ssl: { rejectUnauthorized: true }
});

console.log('=== USERS (first 20) ===');
const [users] = await conn.execute(
  `SELECT id, name, email, role, pricingTier, loginMethod, DATE(createdAt) as created 
   FROM users ORDER BY id LIMIT 20`
);
console.table(users);

console.log('\n=== USER COUNT BY LOGIN METHOD ===');
const [counts] = await conn.execute(
  `SELECT loginMethod, role, COUNT(*) as cnt FROM users GROUP BY loginMethod, role ORDER BY cnt DESC`
);
console.table(counts);

console.log('\n=== ORDERS (all) ===');
const [orders] = await conn.execute(
  `SELECT o.id, o.status, o.totalCents, u.name, u.email, DATE(o.createdAt) as created
   FROM orders o LEFT JOIN users u ON o.userId = u.id ORDER BY o.createdAt LIMIT 20`
);
console.table(orders);

console.log('\n=== ORDER COUNT ===');
const [orderCount] = await conn.execute(`SELECT COUNT(*) as total FROM orders`);
console.table(orderCount);

await conn.end();
