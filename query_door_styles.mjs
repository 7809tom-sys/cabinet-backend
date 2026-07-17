import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(`
    SELECT ds.id, ds.ourName, d.name as distributorName
    FROM door_styles ds
    JOIN distributors d ON ds.distributorId = d.id
    ORDER BY d.name, ds.ourName
`);
console.log(JSON.stringify(rows));
await conn.end();
