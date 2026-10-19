import mysql from "mysql2/promise";

/**
 * Official V8.2 product-key codes mapped to caption-free crops from the
 * owner-provided Syncron source page. No prices, availability, catalog masters,
 * dimensions, or cabinet product images are touched.
 */
const CLEAN_SWATCHES = {
  SSM: { finish: "Syncron Select", sourceName: "Muratti 4", imageUrl: "/manus-storage/aef-syncron-ssm-clean-swatch_8665105d.png" },
  SSO: { finish: "Syncron Select", sourceName: "Como Ash 2", imageUrl: "/manus-storage/aef-syncron-sso-clean-swatch_734057fd.png" },
  SSH: { finish: "Syncron Select", sourceName: "Alhambra 1", imageUrl: "/manus-storage/aef-syncron-ssh-clean-swatch_e07f22f8.png" },
  SSR: { finish: "Syncron Select", sourceName: "Rosales 1", imageUrl: "/manus-storage/aef-syncron-ssr-clean-swatch_9ad18bf7.png" },
  SSV: { finish: "Syncron Select", sourceName: "Velazquez 1", imageUrl: "/manus-storage/aef-syncron-ssv-clean-swatch_187be4fd.png" },
  SSJ: { finish: "Syncron Select", sourceName: "Alhambra 2", imageUrl: "/manus-storage/aef-syncron-ssj-clean-swatch_912f2be6.png" },
  SSP: { finish: "Syncron Select", sourceName: "Picasso 1", imageUrl: "/manus-storage/aef-syncron-ssp-clean-swatch_8bd6ff89.png" },
  SSQ: { finish: "Syncron Select", sourceName: "Picasso 2", imageUrl: "/manus-storage/aef-syncron-ssq-clean-swatch_83b1016c.png" },
  SSN: { finish: "Syncron Select", sourceName: "Nocce 1", imageUrl: "/manus-storage/aef-syncron-ssn-clean-swatch_5536b021.png" },
  SSA: { finish: "Syncron Select", sourceName: "Rosales 2", imageUrl: "/manus-storage/aef-syncron-ssa-clean-swatch_85e088a5.png" },
  SSD: { finish: "Syncron Select", sourceName: "Rosales 4", imageUrl: "/manus-storage/aef-syncron-ssd-clean-swatch_2588c244.png" },
  SSZ: { finish: "Syncron Select", sourceName: "Velazquez 2", imageUrl: "/manus-storage/aef-syncron-ssz-clean-swatch_5649dac0.png" },
  SSK: { finish: "Syncron Select", sourceName: "Alhambra 3", imageUrl: "/manus-storage/aef-syncron-ssk-clean-swatch_15ffb3fb.png" },
  SSE: { finish: "Syncron Select", sourceName: "Nocce 3", imageUrl: "/manus-storage/aef-syncron-sse-clean-swatch_84b82286.png" },
  SSS: { finish: "Syncron Select", sourceName: "Picasso 3", imageUrl: "/manus-storage/aef-syncron-sss-clean-swatch_a34e03c2.png" },
  SSL: { finish: "Syncron Select", sourceName: "Rosales 3", imageUrl: "/manus-storage/aef-syncron-ssl-clean-swatch_118bfeb1.png" },
  SSX: { finish: "Syncron Select", sourceName: "Velazquez 5", imageUrl: "/manus-storage/aef-syncron-ssx-clean-swatch_f8f0c367.png" },
  SCM: { finish: "Syncron Slim Cava", sourceName: "Muratti 4", imageUrl: "/manus-storage/aef-syncron-scm-clean-swatch_66df202b.png" },
  SCR: { finish: "Syncron Slim Cava", sourceName: "Rosales 1", imageUrl: "/manus-storage/aef-syncron-scr-clean-swatch_3a780919.png" },
  SCN: { finish: "Syncron Slim Cava", sourceName: "Nocce 1", imageUrl: "/manus-storage/aef-syncron-scn-clean-swatch_20158e92.png" },
  SCQ: { finish: "Syncron Slim Cava", sourceName: "Picasso 2", imageUrl: "/manus-storage/aef-syncron-scq-clean-swatch_23c9fc55.png" },
  SCA: { finish: "Syncron Slim Cava", sourceName: "Rosales 2", imageUrl: "/manus-storage/aef-syncron-sca-clean-swatch_1e00ca8f.png" },
  SCZ: { finish: "Syncron Slim Cava", sourceName: "Velazquez 2", imageUrl: "/manus-storage/aef-syncron-scz-clean-swatch_2c89c79e.png" },
  SCL: { finish: "Syncron Slim Cava", sourceName: "Rosales 3", imageUrl: "/manus-storage/aef-syncron-scl-clean-swatch_18b6fd64.png" },
} as const;

type StyleCode = keyof typeof CLEAN_SWATCHES;
const STYLE_CODES = Object.keys(CLEAN_SWATCHES) as StyleCode[];
// SCA alone has a stale source room scene which the public card prioritizes over
// the corrected door sample. It is not an approved kitchen scene, so remove only
// that override and let the clean SCA door image become the public fallback.
const STALE_ROOM_SCENE_STYLE_CODES = ["SCA"] as const;

function imageState(row: Record<string, unknown>) {
  return {
    id: row.id,
    styleCode: row.styleCode,
    finish: row.finish,
    active: row.isActive,
    doorSampleImageUrl: row.doorSampleImageUrl,
    drawerSampleImageUrl: row.drawerSampleImageUrl,
    thumbnailImageUrl: row.thumbnailImageUrl,
    cornerSwatchImageUrl: row.cornerSwatchImageUrl,
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
      `SELECT id, styleCode, finish, isActive, doorSampleImageUrl, drawerSampleImageUrl, thumbnailImageUrl, cornerSwatchImageUrl, roomSceneImageUrl
       FROM door_styles WHERE distributorId = ? AND styleCode IN (${STYLE_CODES.map(() => "?").join(",")}) ORDER BY styleCode`,
      [aef.id, ...STYLE_CODES],
    );
    if (before.length !== STYLE_CODES.length) throw new Error(`Expected ${STYLE_CODES.length} AEF Syncron styles; found ${before.length}.`);
    const byCode = new Map(before.map((row: any) => [row.styleCode as StyleCode, row]));
    for (const styleCode of STYLE_CODES) {
      const row = byCode.get(styleCode);
      if (!row || Number(row.isActive) !== 1 || row.finish !== CLEAN_SWATCHES[styleCode].finish) {
        throw new Error(`Refusing to update unexpected AEF Syncron style ${styleCode}.`);
      }
    }

    const plan = STYLE_CODES.map((styleCode) => ({ styleCode, styleId: byCode.get(styleCode)!.id, ...CLEAN_SWATCHES[styleCode] }));
    console.log(JSON.stringify({ mode: apply ? "apply" : "preflight", distributor: aef, planned: plan, before: before.map(imageState) }, null, 2));
    if (!apply) return;

    await db.beginTransaction();
    try {
      for (const item of plan) {
        await db.query(
          `UPDATE door_styles SET doorSampleImageUrl = ?, drawerSampleImageUrl = ?, thumbnailImageUrl = ?
           WHERE id = ? AND distributorId = ? AND styleCode = ? AND isActive = 1 AND finish = ?`,
          [item.imageUrl, item.imageUrl, item.imageUrl, item.styleId, aef.id, item.styleCode, item.finish],
        );
      }
      for (const styleCode of STALE_ROOM_SCENE_STYLE_CODES) {
        const item = plan.find((candidate) => candidate.styleCode === styleCode);
        if (!item) throw new Error(`Missing stale-room-scene cleanup target ${styleCode}.`);
        await db.query(
          `UPDATE door_styles SET roomSceneImageUrl = NULL
           WHERE id = ? AND distributorId = ? AND styleCode = ? AND isActive = 1`,
          [item.styleId, aef.id, styleCode],
        );
      }
      const [after]: any = await db.query(
        `SELECT id, styleCode, finish, isActive, doorSampleImageUrl, drawerSampleImageUrl, thumbnailImageUrl, cornerSwatchImageUrl, roomSceneImageUrl
         FROM door_styles WHERE distributorId = ? AND styleCode IN (${STYLE_CODES.map(() => "?").join(",")}) ORDER BY styleCode`,
        [aef.id, ...STYLE_CODES],
      );
      if (after.length !== STYLE_CODES.length) throw new Error("Target row count changed during swatch refresh.");
      for (const row of after) {
        const expected = CLEAN_SWATCHES[row.styleCode as StyleCode];
        if (!expected || row.finish !== expected.finish || row.doorSampleImageUrl !== expected.imageUrl || row.drawerSampleImageUrl !== expected.imageUrl || row.thumbnailImageUrl !== expected.imageUrl) {
          throw new Error(`Clean swatch verification failed for ${row.styleCode}.`);
        }
        if (row.styleCode === "SCA" && row.roomSceneImageUrl != null) {
          throw new Error("Stale SCA room-scene override was not cleared.");
        }
      }
      await db.commit();
      console.log(JSON.stringify({ applied: after.map(imageState) }, null, 2));
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
