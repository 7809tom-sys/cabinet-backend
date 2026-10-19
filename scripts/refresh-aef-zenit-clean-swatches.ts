import mysql from "mysql2/promise";

/**
 * Source-backed clean swatches cropped from the owner-provided Zenit sample grid.
 * Each crop contains color only—no white page margin, label, or another finish.
 */
const CLEAN_SWATCHES = {
  ZSA: "/manus-storage/aef-zenit-zsa-clean-swatch_1d3dfdf1.png",
  ZSB: "/manus-storage/aef-zenit-zsb-clean-swatch_b59c0c68.png",
  ZSC: "/manus-storage/aef-zenit-zsc-clean-swatch_3c75174f.png",
  ZSI: "/manus-storage/aef-zenit-zsi-clean-swatch_e58dc58e.png",
  ZSK: "/manus-storage/aef-zenit-zsk-clean-swatch_5acee2dc.png",
  ZSL: "/manus-storage/aef-zenit-zsl-clean-swatch_4ae2f56c.png",
  ZSM: "/manus-storage/aef-zenit-zsm-clean-swatch_1f6daaeb.png",
  ZSN: "/manus-storage/aef-zenit-zsn-clean-swatch_77c31db4.png",
  ZSO: "/manus-storage/aef-zenit-zso-clean-swatch_fffeba8e.png",
  ZSP: "/manus-storage/aef-zenit-zsp-clean-swatch_86a61609.png",
  ZSU: "/manus-storage/aef-zenit-zsu-clean-swatch_a7f28bb7.png",
  ZSV: "/manus-storage/aef-zenit-zsv-clean-swatch_776313e5.png",
  ZSW: "/manus-storage/aef-zenit-zsw-clean-swatch_d505cf05.png",
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
      throw new Error(`Expected ${STYLE_CODES.length} AEF Zenit styles; found ${before.length}.`);
    }
    const byCode = new Map(before.map((row: any) => [row.styleCode as StyleCode, row]));
    for (const code of STYLE_CODES) {
      const row = byCode.get(code);
      if (!row || Number(row.isActive) !== 1 || row.finish !== "Zenit Classic") {
        throw new Error(`Refusing to update unexpected AEF Zenit style ${code}.`);
      }
    }

    const plan = STYLE_CODES.map((styleCode) => ({
      styleCode,
      styleId: byCode.get(styleCode)!.id,
      imageUrl: CLEAN_SWATCHES[styleCode],
    }));
    console.log(JSON.stringify({ mode: apply ? "apply" : "preflight", distributor: aef, planned: plan, before: before.map(imageState) }, null, 2));
    if (!apply) return;

    await db.beginTransaction();
    try {
      for (const item of plan) {
        await db.query(
          `UPDATE door_styles
           SET doorSampleImageUrl = ?, drawerSampleImageUrl = ?, thumbnailImageUrl = ?
           WHERE id = ? AND distributorId = ? AND styleCode = ? AND isActive = 1 AND finish = 'Zenit Classic'`,
          [item.imageUrl, item.imageUrl, item.imageUrl, item.styleId, aef.id, item.styleCode],
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
        if (!expected || row.doorSampleImageUrl !== expected || row.drawerSampleImageUrl !== expected || row.thumbnailImageUrl !== expected) {
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
