import mysql from "mysql2/promise";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

/**
 * ONLY the public U.S. Cabinet Depot Frameless (internal AEF) line is updated.
 * Supplier face configurations override shared masters. Source technical drawings,
 * geometry, costs, availability, and framed master artwork remain untouched.
 * Run: pnpm exec tsx scripts/refresh-aef-professional-images.ts [--apply] [--output=path]
 */
export type CatalogCabinet = {
  id: number;
  masterCode: string;
  category: string | null;
  numberOfDoors: number | null;
  numberOfDrawers: number | null;
  height: string | null;
  depth: string | null;
  graphicType?: string | null;
  configJson?: string | null;
};

export const AEF_PROFESSIONAL_ASSETS = {
  accessoryMoulding: "/manus-storage/aef-accessory-moulding-render_fbee12a3.webp",
  accessoryPanel: "/manus-storage/aef-accessory-panel-render_252d1d1a.webp",
  accessoryShelf: "/manus-storage/aef-accessory-shelf-render_6b05a612.webp",
  accessoryEdgeBanding: "/manus-storage/frameless-edge-banding-roll_fd907129.webp",
  accessoryTouchUpKit: "/manus-storage/frameless-cabinet-touchup-kit_7424d03a.webp",
  base2Drawer: "/manus-storage/aef-base-2drawer-render-v2_5d3ab62b.webp",
  base3Drawer: "/manus-storage/frameless-three-drawer-source-proportions_68086f93.webp",
  baseBlindCorner: "/manus-storage/aef-base-blind-corner-render_6c3ba901.webp",
  baseBlindCornerDoubleDoor: "/manus-storage/frameless-base-blind-double-door_67c3cc28.webp",
  baseDoubleDoorDrawer: "/manus-storage/frameless-base-double-door-top-drawer_641a6258.webp",
  baseEasyReach: "/manus-storage/aef-base-easy-reach-render_4ae2e579.webp",
  baseFarmSink: "/manus-storage/aef-base-farm-sink-render_00417aee.webp",
  baseFullHeight: "/manus-storage/frameless-fullheight-single-door-base_2e52f754.webp",
  baseFullHeightDoubleDoor: "/manus-storage/frameless-fullheight-double-door-base_1c2b5b67.webp",
  baseMicrowave: "/manus-storage/aef-base-microwave-render_7cb44a17.webp",
  basePullout: "/manus-storage/aef-base-pullout-render_9e619d41.webp",
  baseSingleDoorDrawer: "/manus-storage/frameless-base-single-door-top-drawer_b0d6089d.webp",
  baseSink: "/manus-storage/aef-base-sink-render_a62fa443.webp",
  tallOneDoorTwoDrawerBottom: "/manus-storage/aef-tall-one-door-two-drawer-bottom-render_9c93246b.webp",
  tallOneDoorThreeDrawerBottom: "/manus-storage/frameless-pantry-single-door-three-drawers_b13bdd91.webp",
  tallTwoDoorTwoDrawerBottom: "/manus-storage/aef-tall-two-door-two-drawer-bottom-render_540fe89b.webp",
  tallTwoDoorThreeDrawerBottom: "/manus-storage/frameless-pantry-double-door-three-drawers_942904b0.webp",
  tallFourDoor: "/manus-storage/aef-tall-four-door-render_d02eb000.webp",
  tallSingleOvenTwoDrawer: "/manus-storage/frameless-single-oven-two-drawers_68de3f4f.webp",
  tallSingleOvenThreeDrawer: "/manus-storage/frameless-oven-three-drawer-source-proportions_19516c82.webp",
  tallDoubleOvenOneDrawer: "/manus-storage/frameless-double-oven-one-drawer_4d0f0d87.webp",
  tallTwoDoor: "/manus-storage/aef-tall-two-door-render_a407dbc5.webp",
  vanity2Drawer: "/manus-storage/aef-vanity-2drawer-render_9babee95.webp",
  vanity3Drawer: "/manus-storage/frameless-vanity-three-drawer-source-proportions_c1f8a4f3.webp",
  vanityKnee: "/manus-storage/aef-vanity-knee-render_0766a3f1.webp",
  vanitySingleDoor: "/manus-storage/aef-vanity-single-door-false-drawer-render_06518436.webp",
  vanityStandard: "/manus-storage/aef-vanity-standard-render_4998e085.webp",
  wallBlindCorner: "/manus-storage/aef-wall-blind-corner-render_ad19ebad.webp",
  wallBlindCornerDoubleDoor: "/manus-storage/frameless-wall-blind-double-door_b04cb793.webp",
  wallBridge: "/manus-storage/frameless-wall-bridge-single-door-empty_c1482a36.webp",
  wallEasyReach: "/manus-storage/frameless-wall-easyreach-one-door_2f3448e4.webp",
  wallFlipup: "/manus-storage/aef-wall-flipup-render_4c4fad02.webp",
  wallRefrigerator: "/manus-storage/aef-wall-refrigerator-single-door-render_ad74b473.webp",
  wallRefrigeratorDoubleDoor: "/manus-storage/frameless-fridge-wall-double-door_7b8097d0.webp",
  wallSingleDoor: "/manus-storage/aef-wall-single-door-render_71412d6f.webp",
  wallStandard30: "/manus-storage/aef-wall-standard-30-render_a7f1bc1a.webp",
  wallStandard35: "/manus-storage/aef-wall-standard-35-render_82902098.webp",
  wallStandard40: "/manus-storage/aef-wall-standard-40-render_75a62dcc.webp",
} as const;

type AssetName = keyof typeof AEF_PROFESSIONAL_ASSETS;
const numeric = (value: string | null) => Number.isFinite(Number(value)) ? Number(value) : 0;

/** Shared master identity is retained; supplier-line construction is authoritative. */
export function effectiveAefCabinetForImage(cabinet: CatalogCabinet): CatalogCabinet {
  if (!cabinet.configJson) return cabinet;
  const config = JSON.parse(cabinet.configJson) as Record<string, unknown>;
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error(`Invalid supplier configuration for ${cabinet.masterCode}`);
  return {
    ...cabinet,
    category: typeof config.category === "string" ? config.category : cabinet.category,
    numberOfDoors: typeof config.numberOfDoors === "number" ? config.numberOfDoors : cabinet.numberOfDoors,
    numberOfDrawers: typeof config.numberOfDrawers === "number" ? config.numberOfDrawers : cabinet.numberOfDrawers,
    height: config.height != null ? String(config.height) : cabinet.height,
    depth: config.depth != null ? String(config.depth) : cabinet.depth,
    graphicType: typeof config.graphicType === "string" ? config.graphicType : cabinet.graphicType,
  };
}

export function professionalAefImageFor(input: CatalogCabinet): AssetName {
  const cabinet = effectiveAefCabinetForImage(input);
  const code = cabinet.masterCode.toUpperCase();
  const category = (cabinet.category ?? "").toUpperCase();
  const graphic = (cabinet.graphicType ?? "").toLowerCase();
  if (code === "BEP2535" || /^WEP\d+$/.test(code)) return "accessoryPanel";
  if (category === "ACCESSORY" || category === "MOLDING") {
    if (code === "EB10") return "accessoryEdgeBanding";
    if (code === "TUK") return "accessoryTouchUpKit";
    if (code === "TEP3096" || /^EB/.test(code)) return "accessoryPanel";
    if (/^FS\d/.test(code)) return "accessoryShelf";
    return "accessoryMoulding";
  }
  if (category === "TALL" || category === "TALL/UTILITY/ACCESSORY" || graphic.startsWith("tall_") || code === "VT1884") {
    if (/^TOD/.test(code)) return "tallDoubleOvenOneDrawer";
    if (/^TOS3DB/.test(code)) return "tallSingleOvenThreeDrawer";
    if (/^TOS2DB/.test(code)) return "tallSingleOvenTwoDrawer";
    if (/^TOS/.test(code)) throw new Error(`Unverified oven face image for ${code}`);
    // Pantry drawers are at the bottom; inner drawers do not add visible fronts.
    if (/^T3DB3/.test(code)) return "tallTwoDoorThreeDrawerBottom";
    if (/^T2DB(?:ID)?3/.test(code)) return "tallTwoDoorTwoDrawerBottom";
    if (/^T3DB/.test(code) || /^VT3DB/.test(code)) return "tallOneDoorThreeDrawerBottom";
    if (/^T2DB/.test(code) || /^VT2DB/.test(code)) return "tallOneDoorTwoDrawerBottom";
    return (cabinet.numberOfDoors ?? 0) >= 4 ? "tallFourDoor" : "tallTwoDoor";
  }
  if (category === "VANITY") {
    if (code === "VSB24S") return "vanitySingleDoor";
    if (/^2VDB/.test(code)) return "vanity2Drawer";
    if (/^3VDB/.test(code)) return "vanity3Drawer";
    if (/^VKD/.test(code)) return "vanityKnee";
    if (/^VSB.*FH$/.test(code) || graphic === "vanity_1door" || graphic === "vanity_2door_fullheight") return (cabinet.numberOfDoors ?? 1) >= 2 ? "baseFullHeightDoubleDoor" : "baseFullHeight";
    return "vanityStandard";
  }
  if (category === "WALL") {
    if (code === "W2430S") return "wallSingleDoor";
    if (/^WFD/.test(code)) return "wallFlipup";
    if (/^WBC/.test(code)) return (cabinet.numberOfDoors ?? 1) >= 2 ? "wallBlindCornerDoubleDoor" : "wallBlindCorner";
    if (/^WER/.test(code)) return "wallEasyReach";
    if (/^W(?:09|12|15|18)\d/.test(code)) return "wallSingleDoor";
    if (numeric(cabinet.depth) >= 20) return (cabinet.numberOfDoors ?? 2) >= 2 ? "wallRefrigeratorDoubleDoor" : "wallRefrigerator";
    const height = numeric(cabinet.height);
    if (height > 0 && height <= 18.5) return "wallBridge";
    if (cabinet.numberOfDoors === 1) return "wallSingleDoor";
    if (height >= 39) return "wallStandard40";
    if (height >= 34) return "wallStandard35";
    return "wallStandard30";
  }
  if (code === "B24S" || code === "SB24S") return "baseSingleDoorDrawer";
  if (/^BBC/.test(code)) return (cabinet.numberOfDoors ?? 1) >= 2 ? "baseBlindCornerDoubleDoor" : "baseBlindCorner";
  // LSB's manufacturer page 19 has TWO DER door components even where a legacy
  // source configuration counts its lazy-susan assembly as one. Keep both faces.
  if (/^(BER|LSB)/.test(code)) return "baseEasyReach";
  if (/^FSB/.test(code)) return "baseFarmSink";
  if (/^BMW/.test(code)) return "baseMicrowave";
  if (/^(BPO|BT9)/.test(code)) return "basePullout";
  // V8 PDF page 16 confirms the same 7-3/8 + 7-3/8 + 15 closed-front appearance
  // for RB3DB; its top front is false, so functional text remains source-owned.
  if (/^(RB)?3DB/.test(code)) return "base3Drawer";
  if (/^(RB)?2DB/.test(code)) return "base2Drawer";
  if (/^SB.*FH$/.test(code)) return (cabinet.numberOfDoors ?? 1) >= 2 ? "baseFullHeightDoubleDoor" : "baseFullHeight";
  if (/^(SB|VSB)/.test(code)) return "baseSink";
  if (/FH/.test(code)) return (cabinet.numberOfDoors ?? 1) >= 2 ? "baseFullHeightDoubleDoor" : "baseFullHeight";
  return (cabinet.numberOfDoors ?? 0) === 1 ? "baseSingleDoorDrawer" : "baseDoubleDoorDrawer";
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function main() {
  const apply = process.argv.includes("--apply");
  const output = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
  const db = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const [[line]]: any = await db.query("SELECT id, name FROM distributors WHERE code = 'AEF' LIMIT 1");
    if (!line) throw new Error("No internal AEF distributor line exists.");
    const [rows]: any = await db.query(
      `SELECT DISTINCT c.id, c.masterCode, c.category, c.numberOfDoors, c.numberOfDrawers,
              COALESCE(o.height, c.height) AS height,
              COALESCE(o.depth, c.depth) AS depth, o.configJson
       FROM distributor_skus s JOIN cabinets c ON c.id = s.cabinetId
       LEFT JOIN distributor_cabinet_overrides o ON o.distributorId = s.distributorId AND o.cabinetId = s.cabinetId
       WHERE s.distributorId = ? AND s.isPublished = 1 AND s.isAvailable = 1 ORDER BY c.masterCode`, [line.id]);
    const cabinets = rows as CatalogCabinet[];
    if (cabinets.length !== 283 || new Set(cabinets.map(c => c.id)).size !== 283) throw new Error(`Expected 283 consistent published AEF masters; found ${cabinets.length}.`);
    if (cabinets.some(c => !c.configJson)) throw new Error("A supplier configuration is missing; do not substitute a shared framed master.");
    const assignments = cabinets.map(cabinet => {
      const effective = effectiveAefCabinetForImage(cabinet);
      const asset = professionalAefImageFor(cabinet);
      return { cabinetId: cabinet.id, masterCode: cabinet.masterCode, asset, imageUrl: AEF_PROFESSIONAL_ASSETS[asset], doors: effective.numberOfDoors, drawers: effective.numberOfDrawers, height: effective.height, depth: effective.depth };
    });
    if (assignments.some(row => !row.imageUrl.startsWith("/manus-storage/") || /PENDING|placeholder/i.test(row.imageUrl))) throw new Error("An assigned product render is unfinished; aborting before any writes.");
    const counts = Object.entries(assignments.reduce<Record<string, number>>((all, row) => { all[row.asset] = (all[row.asset] ?? 0) + 1; return all; }, {})).sort(([a], [b]) => a.localeCompare(b));
    const report = { mode: apply ? "apply" : "preflight", distributor: line.name, publishedMasters: assignments.length, assignmentCounts: counts, assignments };
    if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ ...report, assignments: assignments.slice(0, 16) }, null, 2));
    if (!apply) return;
    const protectedRows = async () => {
      const [data] = await db.query(`SELECT id, cabinetId, styleId, listPrice, yourCost, homeownerPrice, isPublished, isAvailable, geometryWidth, geometryHeight, geometryDepth, geometryStatus, constructionType FROM distributor_skus WHERE distributorId = ? ORDER BY id`, [line.id]);
      return digest(data);
    };
    await db.beginTransaction();
    try {
      const protectedBefore = await protectedRows();
      for (const assignment of assignments) {
        await db.query(`UPDATE distributor_cabinet_overrides SET imageUrl = ?, note = CONCAT(COALESCE(note, ''), CASE WHEN COALESCE(note, '') LIKE '%Professional Frameless product render%' THEN '' ELSE '\nProfessional Frameless product render — neutral construction illustration; finish is selected by the customer swatch.' END) WHERE distributorId = ? AND cabinetId = ?`, [assignment.imageUrl, line.id, assignment.cabinetId]);
        await db.query("UPDATE distributor_skus SET imageUrl = ? WHERE distributorId = ? AND cabinetId = ? AND isPublished = 1 AND isAvailable = 1", [assignment.imageUrl, line.id, assignment.cabinetId]);
      }
      const [actual]: any = await db.query(`SELECT s.cabinetId, s.imageUrl AS skuImage, o.imageUrl AS overrideImage FROM distributor_skus s LEFT JOIN distributor_cabinet_overrides o ON o.distributorId = s.distributorId AND o.cabinetId = s.cabinetId WHERE s.distributorId = ? AND s.isPublished = 1 AND s.isAvailable = 1`, [line.id]);
      const expected = new Map(assignments.map(a => [a.cabinetId, a.imageUrl]));
      const failures = actual.filter((r: any) => r.skuImage !== expected.get(r.cabinetId) || r.overrideImage !== expected.get(r.cabinetId));
      if (failures.length) throw new Error(`${failures.length} source-row images failed verification.`);
      if (await protectedRows() !== protectedBefore) throw new Error("Protected pricing/geometry/source data changed; rolling back.");
      await db.commit();
      console.log(JSON.stringify({ appliedMasters: assignments.length, verifiedSourceRows: actual.length, pricingGeometryAvailabilityUnchanged: true }));
    } catch (error) { await db.rollback(); throw error; }
  } finally { await db.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(error => { console.error(error); process.exitCode = 1; });
}
