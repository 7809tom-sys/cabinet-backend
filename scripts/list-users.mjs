import mysql from 'mysql2/promise';
// Reads the connection string from the environment. Never hardcode credentials in this file.
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('Set DATABASE_URL before running this script.'); process.exit(1); }


const conn = await mysql.createConnection(dbUrl);

const [rows] = await conn.execute(
  'SELECT id, name, email, role, createdAt FROM users ORDER BY createdAt ASC'
);

console.log(`Total users: ${rows.length}\n`);
console.log('ID       | Role        | Name                          | Email');
console.log('-'.repeat(90));
for (const r of rows) {
  const id = String(r.id).padEnd(8);
  const role = String(r.role || '').padEnd(12);
  const name = String(r.name || '(no name)').padEnd(30);
  const email = r.email || '(no email)';
  console.log(`${id} | ${role} | ${name} | ${email}`);
}

await conn.end();
