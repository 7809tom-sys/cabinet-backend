import mysql from "mysql2/promise";

/**
 * Source-backed clean door swatches cropped from the owner-provided Luxe sample grid.
 * Each crop excludes the surrounding page and label while retaining the supplied
 * high-gloss reflection or vertical woodgrain that identifies its actual finish.
 */
const CLEAN_SWATCHES = {
  LSA: { finish: "Luxe Classic", imageUrl: "/manus-storage/aef-luxe-lsa-clean-swatch_4154dedb.png" },
  LSC: { finish: "Luxe Classic", imageUrl: "/manus-storage/aef-luxe-lsc-clean-swatch_c92285a6.png" },
  LSN: { finish: "Luxe Classic", imageUrl: "/manus-storage/aef-luxe-lsn-clean-swatch_00031ec3.png" },
  LSP: { finish: "Luxe Select", imageUrl: "/manus-storage/aef-luxe-lsp-clean-swatch_7c5b26bf.png" },
  LSR: { finish: "Luxe Select", imageUrl: "/manus-storage/aef-luxe-lsr-clean-swatch_c47e44e1.png" },
} as const;

type StyleCode = keyof typeof CLEAN_SWATCHES;
const STYLE_CODES = Object.keys(CLEAN_SWATCHES) as StyleCode[];

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
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const [[aef]]: any = await db.query("SELECT id, code, name FROM distributors WHERE code = 'AEF' LIMIT 1");
    if (!aef) throw new Error("Expected exactly one AEF distributor line.");

    const [before]: any = await db.query(
      `SELECT id, styleCode, finish, isActive, doorSampleImageUrl, drawerSampleImageUrl, thumbnailImageUrl, cornerSwatchImageUrl
       FROM door_styles
       WHERE distributorId = ? AND styleCode IN (${STYLE_CODES.map(() => "?").join(",")})
       ORDER BY styleCode`,
      [aef.id, ...STYLE_CODES],
    );
    if (before.length !== STYLE_CODES.length) {
      throw new Error(`Expected ${STYLE_CODES.length} AEF Luxe styles; found ${before.length}.`);
    }
    const byCode = new Map(before.map((row: any) => [row.styleCode as StyleCode, row]));
    for (const code of STYLE_CODES) {
      const row = byCode.get(code);
      const expected = CLEAN_SWATCHES[code];
      if (!row || Number(row.isActive) !== 1 || row.finish !== expected.finish) {
        throw new Error(`Refusing to update unexpected AEF Luxe style ${code}.`);
      }
    }

    const plan = STYLE_CODES.map((styleCode) => ({
      styleCode,
      styleId: byCode.get(styleCode)!.id,
      finish: CLEAN_SWATCHES[styleCode].finish,
      imageUrl: CLEAN_SWATCHES[styleCode].imageUrl,
    }));
    console.log(JSON.stringify({ mode: apply ? "apply" : "preflight", distributor: aef, planned: plan, before: before.map(imageState) }, null, 2));
    if (!apply) return;

    await db.beginTransaction();
    try {
      for (const item of plan) {
        await db.query(
          `UPDATE door_styles
           SET doorSampleImageUrl = ?, drawerSampleImageUrl = ?, thumbnailImageUrl = ?
           WHERE id = ? AND distributorId = ? AND styleCode = ? AND isActive = 1 AND finish = ?`,
          [item.imageUrl, item.imageUrl, item.imageUrl, item.styleId, aef.id, item.styleCode, item.finish],
        );
      }
      const [after]: any = await db.query(
        `SELECT id, styleCode, finish, isActive, doorSampleImageUrl, drawerSampleImageUrl, thumbnailImageUrl, cornerSwatchImageUrl
         FROM door_styles
         WHERE distributorId = ? AND styleCode IN (${STYLE_CODES.map(() => "?").join(",")})
         ORDER BY styleCode`,
        [aef.id, ...STYLE_CODES],
      );
      if (after.length !== STYLE_CODES.length) throw new Error("Target row count changed during swatch refresh.");
      for (const row of after) {
        const expected = CLEAN_SWATCHES[row.styleCode as StyleCode];
        if (!expected || row.finish !== expected.finish || row.doorSampleImageUrl !== expected.imageUrl || row.drawerSampleImageUrl !== expected.imageUrl || row.thumbnailImageUrl !== expected.imageUrl) {
          throw new Error(`Clean swatch verification failed for ${row.styleCode}.`);
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
