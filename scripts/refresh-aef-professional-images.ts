import mysql from "mysql2/promise";
import { pathToFileURL } from "node:url";

/**
 * Refreshes ONLY the public U.S. Cabinet Depot Frameless (internal AEF) line
 * with clean, neutral, line-specific construction renders. Shared cabinet-master
 * artwork is intentionally never changed: framed lines retain their own images.
 *
 * Run: pnpm exec tsx scripts/refresh-aef-professional-images.ts [--apply]
 */

type CatalogCabinet = {
  id: number;
  masterCode: string;
  category: string | null;
  numberOfDoors: number | null;
  numberOfDrawers: number | null;
  height: string | null;
  depth: string | null;
};

const ASSET = {
  accessoryMoulding: "/manus-storage/aef-accessory-moulding-render_fbee12a3.webp",
  accessoryPanel: "/manus-storage/aef-accessory-panel-render_252d1d1a.webp",
  accessoryShelf: "/manus-storage/aef-accessory-shelf-render_6b05a612.webp",
  base2Drawer: "/manus-storage/aef-base-2drawer-render-v2_5d3ab62b.webp",
  base3Drawer: "/manus-storage/aef-base-3drawer-render_8a9b4ed4.webp",
  baseBlindCorner: "/manus-storage/aef-base-blind-corner-render_6c3ba901.webp",
  baseDoubleDoorDrawer: "/manus-storage/aef-base-double-door-drawer_d8606efe.webp",
  baseEasyReach: "/manus-storage/aef-base-easy-reach-render_4ae2e579.webp",
  baseFarmSink: "/manus-storage/aef-base-farm-sink-render_00417aee.webp",
  baseFullHeight: "/manus-storage/aef-base-full-height-render_b4acbbe5.webp",
  baseMicrowave: "/manus-storage/aef-base-microwave-render_7cb44a17.webp",
  basePullout: "/manus-storage/aef-base-pullout-render_9e619d41.webp",
  baseSingleDoorDrawer: "/manus-storage/aef-base-single-door-drawer_e24450bc.webp",
  baseSink: "/manus-storage/aef-base-sink-render_a62fa443.webp",
  tall2Drawer: "/manus-storage/aef-tall-2drawer-render_362e6087.webp",
  tall3Drawer: "/manus-storage/aef-tall-3drawer-render_12b37ed6.webp",
  tallOneDoorTwoDrawerBottom: "/manus-storage/aef-tall-one-door-two-drawer-bottom-render_9c93246b.webp",
  tallOneDoorThreeDrawerBottom: "/manus-storage/aef-tall-one-door-three-drawer-bottom-render_695ebed3.webp",
  tallTwoDoorTwoDrawerBottom: "/manus-storage/aef-tall-two-door-two-drawer-bottom-render_540fe89b.webp",
  tallTwoDoorThreeDrawerBottom: "/manus-storage/aef-tall-two-door-three-drawer-bottom-render_892131c4.webp",
  tallFourDoor: "/manus-storage/aef-tall-four-door-render_d02eb000.webp",
  tallOven: "/manus-storage/aef-tall-oven-render_0de91002.webp",
  tallTwoDoor: "/manus-storage/aef-tall-two-door-render_a407dbc5.webp",
  vanity2Drawer: "/manus-storage/aef-vanity-2drawer-render_9babee95.webp",
  vanity3Drawer: "/manus-storage/aef-vanity-3drawer-render_009a2403.webp",
  vanityKnee: "/manus-storage/aef-vanity-knee-render_0766a3f1.webp",
  vanitySingleDoor: "/manus-storage/aef-vanity-single-door-false-drawer-render_06518436.webp",
  vanityStandard: "/manus-storage/aef-vanity-standard-render_4998e085.webp",
  wallBlindCorner: "/manus-storage/aef-wall-blind-corner-render_ad19ebad.webp",
  wallBridge: "/manus-storage/aef-wall-bridge-render_794e86f8.webp",
  wallEasyReach: "/manus-storage/aef-wall-easy-reach-render-v2_7222cab7.webp",
  wallFlipup: "/manus-storage/aef-wall-flipup-render_4c4fad02.webp",
  wallOpenShelf: "/manus-storage/aef-wall-open-shelf-render_2649ae31.webp",
  wallRefrigerator: "/manus-storage/aef-wall-refrigerator-single-door-render_ad74b473.webp",
  wallSingleDoor: "/manus-storage/aef-wall-single-door-render_71412d6f.webp",
  wallStandard30: "/manus-storage/aef-wall-standard-30-render_a7f1bc1a.webp",
  wallStandard35: "/manus-storage/aef-wall-standard-35-render_82902098.webp",
  wallStandard40: "/manus-storage/aef-wall-standard-40-render_75a62dcc.webp",
} as const;

type AssetName = keyof typeof ASSET;

function numeric(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Select the correct neutral construction render from exact line/master attributes. */
export function professionalAefImageFor(cabinet: CatalogCabinet): AssetName {
  const code = cabinet.masterCode.toUpperCase();
  const category = (cabinet.category ?? "").toUpperCase();

  if (category === "ACCESSORY" || category === "MOLDING") {
    if (/^FS\d/.test(code)) return "accessoryShelf";
    if (/^(EB|CORNER-PVC)/.test(code)) return "accessoryPanel";
    return "accessoryMoulding";
  }

  if (category === "VANITY") {
    if (code === "VSB24S") return "vanitySingleDoor";
    if (/^2VDB/.test(code)) return "vanity2Drawer";
    if (/^3VDB/.test(code)) return "vanity3Drawer";
    if (/^VKD/.test(code)) return "vanityKnee";
    return "vanityStandard";
  }

  if (category === "TALL" || category === "TALL/UTILITY/ACCESSORY") {
    if (/^TOS/.test(code) || /^TOD/.test(code)) return "tallOven";
    // AltaEuro V8.2 pages 34–41 place pantry drawer banks at the bottom:
    // 18/24 in models have one tall door; 30 in models have two tall doors.
    if (/^T3DB3/.test(code)) return "tallTwoDoorThreeDrawerBottom";
    if (/^T2DB(?:ID)?3/.test(code)) return "tallTwoDoorTwoDrawerBottom";
    if (/^T3DB/.test(code)) return "tallOneDoorThreeDrawerBottom";
    if (/^T2DB/.test(code)) return "tallOneDoorTwoDrawerBottom";
    if (/^VT3DB/.test(code)) return "tallOneDoorThreeDrawerBottom";
    if (/^VT2DB/.test(code)) return "tallOneDoorTwoDrawerBottom";
    if (/^VT/.test(code)) return "tall2Drawer";
    if ((cabinet.numberOfDoors ?? 0) >= 4) return "tallFourDoor";
    return "tallTwoDoor";
  }

  if (category === "WALL") {
    if (code === "W2430S") return "wallSingleDoor";
    if (/^WFD/.test(code)) return "wallFlipup";
    if (/^WBC/.test(code)) return "wallBlindCorner";
    if (/^WER/.test(code)) return "wallEasyReach";
    if (/^W(?:09|12|15|18)\d/.test(code)) return "wallSingleDoor";
    if (numeric(cabinet.depth) >= 20) return "wallRefrigerator";
    const height = numeric(cabinet.height);
    if (height > 0 && height <= 18.5) return "wallBridge";
    if (height >= 39) return "wallStandard40";
    if (height >= 34) return "wallStandard35";
    return "wallStandard30";
  }

  // Remaining items in the published AEF line are floor/base products.
  if (code === "B24S" || code === "SB24S") return "baseSingleDoorDrawer";
  if (/^BBC/.test(code)) return "baseBlindCorner";
  if (/^(BER|LSB)/.test(code)) return "baseEasyReach";
  if (/^FSB/.test(code)) return "baseFarmSink";
  if (/^BMW/.test(code)) return "baseMicrowave";
  if (/^(BPO|BT9)/.test(code)) return "basePullout";
  if (/^(RB)?3DB/.test(code)) return "base3Drawer";
  if (/^(RB)?2DB/.test(code)) return "base2Drawer";
  if (/^(SB|VSB)/.test(code)) return "baseSink";
  if (/FH/.test(code) && !/TCPO/.test(code)) return "baseFullHeight";
  if ((cabinet.numberOfDoors ?? 0) === 1) return "baseSingleDoorDrawer";
  return "baseDoubleDoorDrawer";
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await mysql.createConnection(process.env.DATABASE_URL!);
  const [[line]]: any = await db.query("SELECT id, name FROM distributors WHERE code = 'AEF' LIMIT 1");
  if (!line) throw new Error("No internal AEF distributor line exists.");

  const [cabinets]: [CatalogCabinet[], unknown] = await db.query(
    `SELECT DISTINCT c.id, c.masterCode, c.category, c.numberOfDoors, c.numberOfDrawers, c.height, c.depth
     FROM distributor_skus s
     JOIN cabinets c ON c.id = s.cabinetId
     WHERE s.distributorId = ? AND s.isPublished = 1 AND s.isAvailable = 1
     ORDER BY c.masterCode`,
    [line.id],
  );
  if (cabinets.length !== 277) {
    throw new Error(`Guard failed: expected 277 published AEF cabinet masters, found ${cabinets.length}.`);
  }

  const assignments = cabinets.map((cabinet) => ({
    cabinetId: cabinet.id,
    masterCode: cabinet.masterCode,
    asset: professionalAefImageFor(cabinet),
    imageUrl: ASSET[professionalAefImageFor(cabinet)],
  }));
  const missing = assignments.filter((assignment) => !assignment.imageUrl);
  if (missing.length) throw new Error(`Missing image assignment for ${missing.map((row) => row.masterCode).join(", ")}`);

  const counts = Object.entries(assignments.reduce<Record<string, number>>((all, row) => {
    all[row.asset] = (all[row.asset] ?? 0) + 1;
    return all;
  }, {})).sort(([left], [right]) => left.localeCompare(right));
  console.log(JSON.stringify({
    mode: apply ? "apply" : "preflight",
    distributor: line.name,
    publishedMasters: assignments.length,
    assignmentCounts: counts,
    examples: assignments.slice(0, 16),
  }, null, 2));
  if (!apply) {
    await db.end();
    return;
  }

  await db.beginTransaction();
  try {
    for (const assignment of assignments) {
      // The override shields shared framed cabinet masters. This is the public
      // product-detail/catalog source for the USCD Frameless line.
      await db.query(
        `UPDATE distributor_cabinet_overrides
         SET imageUrl = ?, note = CONCAT(COALESCE(note, ''), CASE WHEN COALESCE(note, '') LIKE '%Professional Frameless product render%' THEN '' ELSE '\nProfessional Frameless product render — neutral construction illustration; finish is selected by the customer swatch.' END)
         WHERE distributorId = ? AND cabinetId = ?`,
        [assignment.imageUrl, line.id, assignment.cabinetId],
      );
      // SKU-level catalog consumers receive the same line-scoped asset. This
      // never touches a shared cabinet-master image or another distributor.
      await db.query(
        "UPDATE distributor_skus SET imageUrl = ? WHERE distributorId = ? AND cabinetId = ? AND isPublished = 1 AND isAvailable = 1",
        [assignment.imageUrl, line.id, assignment.cabinetId],
      );
    }
    const [overrideRows]: any = await db.query(
      `SELECT o.cabinetId, o.imageUrl
       FROM distributor_cabinet_overrides o
       JOIN distributor_skus s ON s.distributorId = o.distributorId AND s.cabinetId = o.cabinetId
       WHERE o.distributorId = ? AND s.isPublished = 1 AND s.isAvailable = 1`,
      [line.id],
    );
    const expectedImages = new Map(assignments.map((assignment) => [assignment.cabinetId, assignment.imageUrl]));
    const actualImages = new Map<number, string>(overrideRows.map((row: { cabinetId: number; imageUrl: string }) => [row.cabinetId, row.imageUrl]));
    const mismatched = assignments.filter((assignment) => actualImages.get(assignment.cabinetId) !== expectedImages.get(assignment.cabinetId));
    if (mismatched.length) {
      throw new Error(`Verification failed for ${mismatched.length} professional override images: ${mismatched.slice(0, 12).map((row) => row.masterCode).join(", ")}.`);
    }
    await db.commit();
    console.log(`Applied ${assignments.length} line-scoped professional image assignments to ${line.name}.`);
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
