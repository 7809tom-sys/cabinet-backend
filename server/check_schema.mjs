import mysql from 'mysql2/promise';

const db = await mysql.createConnection(process.env.DATABASE_URL);

const [cols] = await db.execute('DESCRIBE door_styles');
console.log('door_styles columns:', JSON.stringify(cols.map(c => c.Field)));

const [sample] = await db.execute('SELECT * FROM door_styles LIMIT 5');
console.log('door_styles sample:', JSON.stringify(sample));

const [grSample] = await db.execute("SELECT distributorSku, distributorId, yourCost FROM distributor_skus WHERE distributorSku LIKE 'GR-%' LIMIT 5");
console.log('GR sample:', JSON.stringify(grSample));

await db.end();
