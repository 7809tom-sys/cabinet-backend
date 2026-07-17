import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all active styles with their room scene status
const [rows] = await conn.execute(
  'SELECT id, styleCode, ourName, color, finish, roomSceneImageUrl FROM door_styles WHERE isActive = 1 ORDER BY styleCode'
);

console.log('\n=== All active styles ===');
for (const r of rows) {
  const has = r.roomSceneImageUrl ? '✓' : '✗ MISSING';
  console.log(`${has} [${r.styleCode}] ${r.ourName} (color: ${r.color ?? 'null'})`);
}

const missing = rows.filter(r => !r.roomSceneImageUrl);
console.log('\n=== Missing room scenes ===');
console.log(JSON.stringify(missing.map(r => ({ id: r.id, styleCode: r.styleCode, ourName: r.ourName, color: r.color })), null, 2));

// Also show all available scene URLs grouped by styleCode
const hasScene = rows.filter(r => r.roomSceneImageUrl);
console.log('\n=== Available scenes ===');
for (const r of hasScene) {
  console.log(`[${r.styleCode}] ${r.ourName}: ${r.roomSceneImageUrl}`);
}

await conn.end();
