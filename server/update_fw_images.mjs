import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/cabinet-dealz/.env' });

const conn = await createConnection(process.env.DATABASE_URL);

const STYLE_ID = 180020; // Floral White

// Update door_styles with room scene and door sample images
await conn.execute(
  `UPDATE door_styles SET 
    roomSceneImageUrl = ?,
    doorSampleImageUrl = ?
   WHERE id = ?`,
  [
    '/manus-storage/floral_white_room_scene_321944a9.jpg',
    '/manus-storage/floral_white_door_sample_7bda9b41.jpg',
    STYLE_ID
  ]
);

console.log('Updated door_styles for Floral White (id=180020)');

// Verify
const [rows] = await conn.execute(
  'SELECT id, ourName, roomSceneImageUrl, doorSampleImageUrl FROM door_styles WHERE id = ?',
  [STYLE_ID]
);
console.log('Result:', JSON.stringify(rows[0], null, 2));

await conn.end();
