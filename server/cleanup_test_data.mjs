import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const [,user,password,host,port,database] = match;

const conn = await createConnection({
  host, port: parseInt(port), user, password, database,
  ssl: { rejectUnauthorized: true }
});

// First check how many test users we're about to delete
const [countResult] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM users WHERE loginMethod IS NULL`
);
console.log('Test users to delete:', countResult[0].cnt);

// Delete related data first (cascade-safe order)
console.log('Deleting cart items for test users...');
const [ci] = await conn.execute(
  `DELETE ci FROM cart_items ci 
   JOIN carts c ON ci.cartId = c.id 
   JOIN users u ON c.userId = u.id 
   WHERE u.loginMethod IS NULL`
);
console.log('Cart items deleted:', ci.affectedRows);

console.log('Deleting carts for test users...');
const [carts] = await conn.execute(
  `DELETE c FROM carts c 
   JOIN users u ON c.userId = u.id 
   WHERE u.loginMethod IS NULL`
);
console.log('Carts deleted:', carts.affectedRows);

console.log('Deleting saved designs for test users...');
const [designs] = await conn.execute(
  `DELETE sd FROM saved_designs sd 
   JOIN users u ON sd.userId = u.id 
   WHERE u.loginMethod IS NULL`
).catch(() => [{ affectedRows: 0 }]);
console.log('Saved designs deleted:', designs.affectedRows);

// Check orders table columns
const [cols] = await conn.execute(`SHOW COLUMNS FROM orders`);
console.log('\nOrders table columns:', cols.map(c => c.Field));

// Delete test user orders
console.log('\nDeleting orders for test users...');
const [orders] = await conn.execute(
  `DELETE o FROM orders o 
   JOIN users u ON o.userId = u.id 
   WHERE u.loginMethod IS NULL`
).catch(e => { console.log('Orders delete error:', e.message); return [{ affectedRows: 0 }]; });
console.log('Orders deleted:', orders.affectedRows);

// Now delete the test users themselves
console.log('\nDeleting test users...');
const [deleted] = await conn.execute(
  `DELETE FROM users WHERE loginMethod IS NULL`
);
console.log('Test users deleted:', deleted.affectedRows);

// Final count
const [remaining] = await conn.execute(`SELECT COUNT(*) as cnt FROM users`);
console.log('Remaining real users:', remaining[0].cnt);

// Show all orders
const [allOrders] = await conn.execute(
  `SELECT o.id, o.status, u.name, u.email, o.createdAt FROM orders o LEFT JOIN users u ON o.userId = u.id ORDER BY o.createdAt`
);
console.log('\nAll orders:');
console.table(allOrders);

await conn.end();
