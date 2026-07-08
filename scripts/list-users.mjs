import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const dbUrl = 'mysql://DvD55VJpkhp6SW2.root:1O1ay9q9HJrMk1Li5Zxn@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/DQ7pUcbPFvKvFZ8JnyMs4M?ssl={"rejectUnauthorized":true}';

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
