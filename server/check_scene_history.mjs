import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check what the current roomSceneImageUrl values look like grouped by URL pattern
const [patterns] = await conn.execute(`
  SELECT 
    CASE 
      WHEN roomSceneImageUrl LIKE '%cloudfront%' THEN 'cloudfront (broken)'
      WHEN roomSceneImageUrl LIKE '/manus-storage%' THEN 'manus-storage (working)'
      WHEN roomSceneImageUrl LIKE 'http%' THEN 'other http'
      WHEN roomSceneImageUrl IS NULL THEN 'NULL'
      ELSE 'other'
    END as url_type,
    COUNT(*) as count
  FROM door_styles
  GROUP BY url_type
`);
console.log('URL patterns:', patterns);

// Check which styles have manus-storage room scenes (these are the ones we generated)
const [working] = await conn.execute(`
  SELECT id, styleCode, ourName, roomSceneImageUrl
  FROM door_styles
  WHERE roomSceneImageUrl LIKE '/manus-storage%'
  ORDER BY ourName
`);
console.log('\nWorking room scenes (/manus-storage):');
working.forEach(r => console.log(r.id, r.styleCode, r.ourName, '->', r.roomSceneImageUrl));

// Check the cloudfront URL pattern more closely - is it the same URL for all?
const [cfSample] = await conn.execute(`
  SELECT DISTINCT roomSceneImageUrl FROM door_styles WHERE roomSceneImageUrl LIKE '%cloudfront%' LIMIT 5
`);
console.log('\nCloudfront URL samples:');
cfSample.forEach(r => console.log(r.roomSceneImageUrl));

await conn.end();
