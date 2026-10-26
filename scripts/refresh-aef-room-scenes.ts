import mysql from "mysql2/promise";

/**
 * One exact 4:3 kitchen room scene for each active AEF style that received a
 * verified clean door swatch. Door, drawer, and thumbnail swatches remain
 * untouched: this script writes only the customer-facing roomSceneImageUrl.
 */
const ROOM_SCENES = {
  ZSA: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsa-room-scene_147b55db.png" },
  ZSB: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsb-room-scene_443fec97.png" },
  ZSC: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsc-room-scene_2fa2f112.png" },
  ZSI: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsi-room-scene_18568983.png" },
  ZSK: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsk-room-scene_2c173501.png" },
  ZSL: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsl-room-scene_76e94677.png" },
  ZSM: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsm-room-scene_5b9a72a0.png" },
  ZSN: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsn-room-scene_9d80b0e7.png" },
  ZSO: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zso-room-scene_17627471.png" },
  ZSP: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsp-room-scene_e68914f2.png" },
  ZSU: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsu-room-scene_22707259.png" },
  ZSV: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsv-room-scene_d042ecd1.png" },
  ZSW: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsw-room-scene_4a9dce34.png" },
  LSA: { finish: "Luxe Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-lsa-room-scene_f6ab4fd5.png" },
  LSC: { finish: "Luxe Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-lsc-room-scene_a6703f0c.png" },
  LSN: { finish: "Luxe Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-lsn-room-scene_c24df504.png" },
  LSP: { finish: "Luxe Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-lsp-room-scene_29ae3f60.png" },
  LSR: { finish: "Luxe Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-lsr-room-scene_ae7833a1.png" },
  SSA: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssa-room-scene_b70610d5.png" },
  SSD: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssd-room-scene_4c16ca91.png" },
  SSE: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-sse-room-scene_d289664f.png" },
  SSH: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssh-room-scene_efe23727.png" },
  SSJ: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssj-room-scene_757d6242.png" },
  SSK: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssk-room-scene_12514ac0.png" },
  SSL: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssl-room-scene_d3528124.png" },
  SSM: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssm-room-scene_9c2782c0.png" },
  SSN: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssn-room-scene_6a165890.png" },
  SSO: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-sso-room-scene_27f1dfeb.png" },
  SSP: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssp-room-scene_8c4254c6.png" },
  SSQ: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssq-room-scene_701a7a5c.png" },
  SSR: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssr-room-scene_0615e229.png" },
  SSS: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-sss-room-scene_21ebe73a.png" },
  SSV: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssv-room-scene_c642d499.png" },
  SSX: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssx-room-scene_47ddd5d7.png" },
  SSZ: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssz-room-scene_aea3d3de.png" },
  SCA: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-sca-room-scene_c748a5a3.png" },
  SCL: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-scl-room-scene_36aeb790.png" },
  SCM: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-scm-room-scene_e624dfed.png" },
  SCN: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-scn-room-scene_3d6befc0.png" },
  SCQ: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-scq-room-scene_3ca17962.png" },
  SCR: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-scr-room-scene_55ff0ba7.png" },
  SCZ: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-scz-room-scene_649634f6.png" },
} as const;

type StyleCode = keyof typeof ROOM_SCENES;
const STYLE_CODES = Object.keys(ROOM_SCENES) as StyleCode[];

function sceneState(row: Record<string, unknown>) {
  return {
    id: row.id,
    styleCode: row.styleCode,
    finish: row.finish,
    doorStyle: row.doorStyle,
    active: row.isActive,
    doorSampleImageUrl: row.doorSampleImageUrl,
    roomSceneImageUrl: row.roomSceneImageUrl,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const [[aef]]: any = await db.query("SELECT id, code, name FROM distributors WHERE code = 'AEF' LIMIT 1");
    if (!aef) throw new Error("Expected exactly one AEF distributor line.");
    const [before]: any = await db.query(
      `SELECT id, styleCode, finish, doorStyle, isActive, doorSampleImageUrl, roomSceneImageUrl
       FROM door_styles WHERE distributorId = ? AND styleCode IN (${STYLE_CODES.map(() => "?").join(",")}) ORDER BY styleCode`,
      [aef.id, ...STYLE_CODES],
    );
    if (before.length !== STYLE_CODES.length) {
      throw new Error(`Expected ${STYLE_CODES.length} active AEF room-scene targets; found ${before.length}.`);
    }
    const byCode = new Map(before.map((row: any) => [row.styleCode as StyleCode, row]));
    for (const styleCode of STYLE_CODES) {
      const row = byCode.get(styleCode);
      const expected = ROOM_SCENES[styleCode];
      if (!row || Number(row.isActive) !== 1 || row.finish !== expected.finish || row.doorStyle !== expected.doorStyle || !row.doorSampleImageUrl) {
        throw new Error(`Refusing to update unexpected AEF room-scene target ${styleCode}.`);
      }
    }
    const planned = STYLE_CODES.map((styleCode) => ({
      styleCode,
      styleId: byCode.get(styleCode)!.id,
      ...ROOM_SCENES[styleCode],
    }));
    console.log(JSON.stringify({ mode: apply ? "apply" : "preflight", distributor: aef, planned, before: before.map(sceneState) }, null, 2));
    if (!apply) return;

    await db.beginTransaction();
    try {
      for (const item of planned) {
        await db.query(
          `UPDATE door_styles SET roomSceneImageUrl = ?
           WHERE id = ? AND distributorId = ? AND styleCode = ? AND isActive = 1 AND finish = ? AND doorStyle = ?`,
          [item.imageUrl, item.styleId, aef.id, item.styleCode, item.finish, item.doorStyle],
        );
      }
      const [after]: any = await db.query(
        `SELECT id, styleCode, finish, doorStyle, isActive, doorSampleImageUrl, roomSceneImageUrl
         FROM door_styles WHERE distributorId = ? AND styleCode IN (${STYLE_CODES.map(() => "?").join(",")}) ORDER BY styleCode`,
        [aef.id, ...STYLE_CODES],
      );
      if (after.length !== STYLE_CODES.length) throw new Error("Target row count changed during room-scene refresh.");
      for (const row of after) {
        const expected = ROOM_SCENES[row.styleCode as StyleCode];
        if (!expected || Number(row.isActive) !== 1 || row.finish !== expected.finish || row.doorStyle !== expected.doorStyle || row.roomSceneImageUrl !== expected.imageUrl || !row.doorSampleImageUrl) {
          throw new Error(`Room-scene verification failed for ${row.styleCode}.`);
        }
      }
      await db.commit();
      console.log(JSON.stringify({ applied: after.map(sceneState) }, null, 2));
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
