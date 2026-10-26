#!/usr/bin/env node
/**
 * Seeds room-layout presets and, optionally, real SKU selections for ONE
 * existing design. It never invents cabinet codes, prices, or distributor
 * products: every selected SKU is read from distributor_skus after enforcing
 * active + published + available + approved catalog eligibility.
 *
 * Safe default (no writes):
 *   pnpm seed:room-layout
 *
 * Apply only presets/zones after the room-layout migration:
 *   pnpm seed:room-layout --apply --confirm-real-catalog-only
 *
 * Populate real SKU selections for an existing test design:
 *   pnpm seed:room-layout --apply --confirm-real-catalog-only \
 *     --design-id 123 --distributor-id 1 --style-id 4
 *
 * The script does not create a fake customer design. A supplied design ID must
 * already exist. When no valid SKU exists for a zone, it stores an explicit
 * needs_selection record rather than making up a product.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmed = args.includes("--confirm-real-catalog-only");

function flagNumber(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const raw = args[index + 1];
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be followed by a positive integer.`);
  }
  return value;
}

const designId = flagNumber("--design-id");
const distributorId = flagNumber("--distributor-id");
const styleId = flagNumber("--style-id");

if (apply && !confirmed) {
  throw new Error("Refusing to write. Include --confirm-real-catalog-only with --apply.");
}
if ((designId != null || distributorId != null || styleId != null)
  && !(designId != null && distributorId != null && styleId != null)) {
  throw new Error("SKU selection seeding requires --design-id, --distributor-id, and --style-id together.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const writeMode = apply ? "APPLY" : "DRY RUN";

const requiredTables = [
  "room_shape_presets",
  "layout_presets",
  "layout_preset_zones",
  "design_layout_instances",
  "design_layout_zone_selections",
];

async function ensureRoomLayoutSchema() {
  const [rows] = await connection.execute(
    `SELECT table_name AS tableName
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (${requiredTables.map(() => "?").join(", ")})`,
    requiredTables,
  );
  const present = new Set(rows.map((row) => row.tableName));
  const missing = requiredTables.filter((table) => !present.has(table));
  if (missing.length) {
    console.log(`[${writeMode}] Room-layout migration has not been applied. Missing: ${missing.join(", ")}`);
    console.log("No data was written. Apply the reviewed migration first, then rerun this script.");
    return false;
  }
  return true;
}

const roomShapes = [
  {
    id: "rectangle",
    roomType: "kitchen",
    name: "Rectangle",
    description: "A single rectangular kitchen room.",
    geometryTemplate: {
      vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      walls: ["north", "east", "south", "west"],
    },
    defaultDimensions: { width: 144, depth: 120, ceilingHeight: 96 },
  },
  {
    id: "l_shape",
    roomType: "kitchen",
    name: "L-Shape",
    description: "An L-shaped kitchen room with two primary cabinet runs.",
    geometryTemplate: {
      vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.45 }, { x: 0.55, y: 0.45 }, { x: 0.55, y: 1 }, { x: 0, y: 1 }],
      walls: ["back", "right", "inside_horizontal", "inside_vertical", "left", "front"],
    },
    defaultDimensions: { width: 156, depth: 156, ceilingHeight: 96 },
  },
];

const layout = {
  id: "kitchen_l_standard",
  roomShapePresetId: "l_shape",
  roomType: "kitchen",
  name: "Standard L Kitchen",
  description: "Two connected cabinet runs with a corner, sink base, and matching wall cabinets.",
  minimumWidth: 120,
  minimumDepth: 120,
  defaultRoomData: { defaultWallKeys: ["back", "left"], applianceZones: ["range", "refrigerator"] },
};

const rectangleLayout = {
  id: "kitchen_one_wall_standard",
  roomShapePresetId: "rectangle",
  roomType: "kitchen",
  name: "One-Wall Kitchen",
  description: "A practical single-wall kitchen starter with a sink base, base run, and matching wall cabinet zone.",
  minimumWidth: 96,
  minimumDepth: 84,
  defaultRoomData: { defaultWallKeys: ["back"], applianceZones: ["range", "refrigerator"] },
};

// Functional rules only. These rows do not contain product IDs or fabricated
// codes; runtime matching resolves a real distributor SKU for each zone.
const zones = [
  { zoneKey: "back_base", label: "Back wall base", wallKey: "back", sequence: 10, placementType: "base", requiredCategory: "Base", requiredSubCategory: "Standard Base", minWidth: 18, targetWidth: 24, maxWidth: 36, isRequired: true },
  { zoneKey: "sink_base", label: "Sink base", wallKey: "back", sequence: 20, placementType: "base", requiredCategory: "Base", requiredSubCategory: "Sink Base", minWidth: 24, targetWidth: 30, maxWidth: 36, isRequired: true, matchingRules: { requiresSinkCutout: true } },
  { zoneKey: "left_corner", label: "Left corner base", wallKey: "left", sequence: 30, placementType: "base", requiredCategory: "Base", requiredProductType: "corner", minWidth: 30, targetWidth: 36, maxWidth: 42, isRequired: false, matchingRules: { cornerRequired: true } },
  { zoneKey: "back_wall", label: "Back wall cabinet", wallKey: "back", sequence: 40, placementType: "wall", requiredCategory: "Wall", requiredSubCategory: "Standard Wall", minWidth: 18, targetWidth: 30, maxWidth: 36, isRequired: true },
];

const rectangleZones = [
  { zoneKey: "base_run", label: "Base cabinet run", wallKey: "back", sequence: 10, placementType: "base", requiredCategory: "Base", requiredSubCategory: "Standard Base", minWidth: 18, targetWidth: 24, maxWidth: 36, isRequired: true },
  { zoneKey: "sink_base", label: "Sink base", wallKey: "back", sequence: 20, placementType: "base", requiredCategory: "Base", requiredSubCategory: "Sink Base", minWidth: 24, targetWidth: 30, maxWidth: 36, isRequired: true, matchingRules: { requiresSinkCutout: true } },
  { zoneKey: "wall_cabinet", label: "Wall cabinet", wallKey: "back", sequence: 30, placementType: "wall", requiredCategory: "Wall", requiredSubCategory: "Standard Wall", minWidth: 18, targetWidth: 30, maxWidth: 36, isRequired: true },
];

async function upsertPresets() {
  for (const shape of roomShapes) {
    if (!apply) {
      console.log(`[DRY RUN] Upsert room shape: ${shape.id}`);
      continue;
    }
    await connection.execute(
      `INSERT INTO room_shape_presets
        (id, roomType, name, description, geometryTemplate, defaultDimensions, sortOrder, isActive, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, 1)
       ON DUPLICATE KEY UPDATE
         roomType = VALUES(roomType), name = VALUES(name), description = VALUES(description),
         geometryTemplate = VALUES(geometryTemplate), defaultDimensions = VALUES(defaultDimensions),
         sortOrder = VALUES(sortOrder), isActive = TRUE, version = VALUES(version)`,
      [shape.id, shape.roomType, shape.name, shape.description, JSON.stringify(shape.geometryTemplate), JSON.stringify(shape.defaultDimensions), shape.id === "rectangle" ? 10 : 20],
    );
  }

  const upsertLayoutAndZones = async (preset, presetZones, sortOrder) => {
    if (!apply) {
      console.log(`[DRY RUN] Upsert layout: ${preset.id} and ${presetZones.length} functional zones`);
      return;
    }
    await connection.execute(
      `INSERT INTO layout_presets
        (id, roomShapePresetId, roomType, name, description, minimumWidth, minimumDepth, defaultRoomData, sortOrder, isActive, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, 1)
       ON DUPLICATE KEY UPDATE
         roomShapePresetId = VALUES(roomShapePresetId), roomType = VALUES(roomType), name = VALUES(name),
         description = VALUES(description), minimumWidth = VALUES(minimumWidth), minimumDepth = VALUES(minimumDepth),
         defaultRoomData = VALUES(defaultRoomData), sortOrder = VALUES(sortOrder), isActive = TRUE, version = VALUES(version)`,
      [preset.id, preset.roomShapePresetId, preset.roomType, preset.name, preset.description, preset.minimumWidth, preset.minimumDepth, JSON.stringify(preset.defaultRoomData), sortOrder],
    );
    for (const zone of presetZones) {
      await connection.execute(
        `INSERT INTO layout_preset_zones
          (layoutPresetId, zoneKey, label, wallKey, sequence, placementType, requiredCategory, requiredSubCategory,
           requiredProductType, minWidth, targetWidth, maxWidth, isRequired, allowCustomSize, matchingRules)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?)
         ON DUPLICATE KEY UPDATE
           label = VALUES(label), wallKey = VALUES(wallKey), sequence = VALUES(sequence), placementType = VALUES(placementType),
           requiredCategory = VALUES(requiredCategory), requiredSubCategory = VALUES(requiredSubCategory),
           requiredProductType = VALUES(requiredProductType), minWidth = VALUES(minWidth), targetWidth = VALUES(targetWidth),
           maxWidth = VALUES(maxWidth), isRequired = VALUES(isRequired), matchingRules = VALUES(matchingRules)`,
        [preset.id, zone.zoneKey, zone.label, zone.wallKey, zone.sequence, zone.placementType, zone.requiredCategory,
          zone.requiredSubCategory ?? null, zone.requiredProductType ?? null, zone.minWidth, zone.targetWidth, zone.maxWidth,
          zone.isRequired, zone.matchingRules ? JSON.stringify(zone.matchingRules) : null],
      );
    }
  };

  await upsertLayoutAndZones(rectangleLayout, rectangleZones, 10);
  await upsertLayoutAndZones(layout, zones, 20);
}

async function resolveCandidate(zone) {
  const [rows] = await connection.execute(
    `SELECT ds.id AS distributorSkuId, c.id AS cabinetId, c.masterCode, c.description, c.width
       FROM distributor_skus ds
       JOIN cabinets c ON c.id = ds.cabinetId
       JOIN distributors d ON d.id = ds.distributorId
       JOIN door_styles s ON s.id = ds.styleId
      WHERE ds.distributorId = ? AND ds.styleId = ?
        AND ds.isPublished = TRUE AND ds.isAvailable = TRUE AND ds.status = 'approved'
        AND d.isActive = TRUE AND s.isActive = TRUE
        AND c.isActive = TRUE AND c.showInDesigner = TRUE AND c.conflictStatus = 'none'
        AND c.category = ?
        AND (? IS NULL OR c.subCategory = ?)
        AND (? IS NULL OR c.productType = ?)
        AND (c.width IS NULL OR c.width BETWEEN ? AND ?)
      ORDER BY ABS(COALESCE(c.width, ?) - ?) ASC, ds.id ASC
      LIMIT 1`,
    [distributorId, styleId, zone.requiredCategory, zone.requiredSubCategory ?? null, zone.requiredSubCategory ?? null,
      zone.requiredProductType ?? null, zone.requiredProductType ?? null, zone.minWidth, zone.maxWidth,
      zone.targetWidth, zone.targetWidth],
  );
  return rows[0] ?? null;
}

async function seedDesignSelections() {
  if (designId == null) return;
  const [designs] = await connection.execute("SELECT id FROM kitchen_designs WHERE id = ? LIMIT 1", [designId]);
  if (!designs.length) throw new Error(`Design ${designId} does not exist; refusing to create a mock design.`);

  const previews = [];
  for (const zone of zones) previews.push({ zoneKey: zone.zoneKey, candidate: await resolveCandidate(zone) });
  for (const preview of previews) {
    console.log(`[${writeMode}] ${preview.zoneKey}: ${preview.candidate ? `${preview.candidate.masterCode} (SKU ${preview.candidate.distributorSkuId})` : "NO ELIGIBLE SKU — needs_selection"}`);
  }
  if (!apply) return;

  await connection.execute(
    `UPDATE kitchen_designs
        SET designSchemaVersion = GREATEST(designSchemaVersion, 2), layoutSource = 'wizard',
            layoutPresetId = ?, layoutPresetVersion = 1
      WHERE id = ?`,
    [layout.id, designId],
  );
  const [instanceResult] = await connection.execute(
    `INSERT INTO design_layout_instances
      (kitchenDesignId, roomShapePresetId, roomShapeVersion, layoutPresetId, layoutPresetVersion, source, resolutionStatus)
     VALUES (?, ?, 1, ?, 1, 'wizard', 'draft')
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), roomShapePresetId = VALUES(roomShapePresetId),
       roomShapeVersion = VALUES(roomShapeVersion), layoutPresetId = VALUES(layoutPresetId),
       layoutPresetVersion = VALUES(layoutPresetVersion), source = 'wizard'`,
    [designId, layout.roomShapePresetId, layout.id],
  );
  const instanceId = instanceResult.insertId;
  const [zoneRows] = await connection.execute(
    "SELECT id, zoneKey FROM layout_preset_zones WHERE layoutPresetId = ?", [layout.id],
  );
  const zoneIdByKey = new Map(zoneRows.map((row) => [row.zoneKey, row.id]));

  let allResolved = true;
  for (const preview of previews) {
    const candidate = preview.candidate;
    const status = candidate ? "matched" : "needs_selection";
    allResolved &&= Boolean(candidate);
    await connection.execute(
      `INSERT INTO design_layout_zone_selections
        (designLayoutInstanceId, layoutPresetZoneId, zoneKey, cabinetId, distributorSkuId, distributorId, styleId,
         status, matchReason, matchDetails, resolvedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         layoutPresetZoneId = VALUES(layoutPresetZoneId), cabinetId = VALUES(cabinetId), distributorSkuId = VALUES(distributorSkuId),
         distributorId = VALUES(distributorId), styleId = VALUES(styleId), status = VALUES(status),
         matchReason = VALUES(matchReason), matchDetails = VALUES(matchDetails), resolvedAt = VALUES(resolvedAt)`,
      [instanceId, zoneIdByKey.get(preview.zoneKey), preview.zoneKey, candidate?.cabinetId ?? null,
        candidate?.distributorSkuId ?? null, distributorId, styleId, status,
        candidate ? "best_fit_active_published" : "no_eligible_active_published_sku",
        JSON.stringify({ seededBy: "seed-room-layout-presets", candidateMasterCode: candidate?.masterCode ?? null }),
        candidate ? new Date() : null],
    );
  }
  await connection.execute(
    "UPDATE design_layout_instances SET resolutionStatus = ? WHERE id = ?",
    [allResolved ? "resolved" : "partially_resolved", instanceId],
  );
}

try {
  if (await ensureRoomLayoutSchema()) {
    if (apply) await connection.beginTransaction();
    await upsertPresets();
    await seedDesignSelections();
    if (apply) await connection.commit();
    console.log(`[${writeMode}] Complete. ${apply ? "Only real catalog records were used." : "No data was written."}`);
  }
} catch (error) {
  if (apply) await connection.rollback();
  throw error;
} finally {
  // destroy() closes immediately even when a managed database connection has an
  // outstanding keep-alive socket; the script has no pooled connections to reuse.
  connection.destroy();
}
