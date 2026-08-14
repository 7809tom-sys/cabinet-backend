import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Camera, ChevronDown, Download, FileDown, Info, LoaderCircle, Mail, Maximize2, Minimize2, Move3D, Printer, Rotate3D, Save, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { STD, placedFootprint, type PlacedCabinet, type RoomData, type SinkFixture, type WallOpening } from "@/lib/design";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type SceneSku = {
  distributorSkuId: number;
  cabinetId: number;
  masterCode: string;
  description: string | null;
  placementType: string | null;
  width: unknown;
  height: unknown;
  depth: unknown;
  numberOfDoors: number | null;
  numberOfDrawers: number | null;
  openingType?: string | null;
  doorHeight?: number | null;
  drawerHeight?: number | null;
  drawerLayout?: string | null;
  ovenType?: "single" | "double" | null;
  graphicType?: string | null;
  customProfile?: string | null;
  facePattern?: "slats" | "criss-cross" | "lattice" | "open" | null;
  cornerType?: string | null;
};

export type InteractiveRoomScene = {
  roomShape: { id: string; name: string; defaultDimensions: unknown; geometryTemplate: unknown } | null;
  layout: { id: string; name: string } | null;
  suggestions: Array<{
    zone: { zoneKey: string; label: string; wallKey: string | null; sequence: number; placementType: string | null; required: boolean };
    sku: SceneSku | null;
  }>;
  materials: {
    cabinet: { publicName: string | null; name: string; color: string | null; finish: string | null; doorStyle: string | null; doorPanelType: string | null };
    defaults: { floor: string; countertop: string; backsplash: string; wall: string };
  } | null;
};

export type InteractiveRoomOrderSummary = {
  itemCount: number;
  pricedLineCount: number;
  unpricedLineCount: number;
  subtotal: number;
};

export type InteractiveRoomOrderLine = {
  id: string;
  label: string;
  detail?: string | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
};

export type InteractiveRoomCatalogItem = {
  id: number;
  masterCode: string;
  description: string | null;
  category: "Accessory" | "Appliance";
};

export type InteractiveRoomPresentation = {
  cabinetFinish: string;
  countertopFinish: string;
};

interface Props {
  scene: InteractiveRoomScene;
  /** Current 2D design items take precedence over starter-layout suggestions. */
  placed?: PlacedCabinet[];
  roomOverride?: RoomData;
  /** Doors, cased openings, and windows from the current 2D plan. */
  openings?: WallOpening[];
  /** Countertop sink fixtures from the current 2D plan. */
  sinks?: SinkFixture[];
  orderSummary?: InteractiveRoomOrderSummary;
  orderLines?: InteractiveRoomOrderLine[];
  initialPresentation?: InteractiveRoomPresentation;
  /** Active design-tool finish derived from the chosen catalog door style. */
  catalogFinishOverride?: string | null;
  /** Exact selected 2D door sample applied to 3D cabinet faces in catalog-finish mode. */
  catalogDoorSampleUrl?: string | null;
  /** Human-readable catalog selections used in PDF and account-email output. */
  catalogFinishName?: string | null;
  catalogCountertopName?: string | null;
  shareContext?: { layoutPresetId: string; distributorId: number; styleId: number };
  catalogItems?: InteractiveRoomCatalogItem[];
  onAddCatalogItem?: (item: InteractiveRoomCatalogItem) => void;
  onSaveToAccount?: () => void;
  onPresentationChange?: (presentation: InteractiveRoomPresentation) => void;
  className?: string;
}

const INCH = 1 / 12;
const BASE_DEPTH = 24;
const WALL_DEPTH = 12;
const COUNTERTOP_H = 37.5;
const WALL_BOTTOM = 54;
const CABINET_FINISHES = [
  { name: "Catalog finish", color: "catalog" },
  { name: "Soft White", color: "#f2f0ea" },
  { name: "Sage", color: "#78826b" },
  { name: "Navy", color: "#435b77" },
  { name: "Walnut", color: "#75523e" },
  { name: "Charcoal", color: "#34363a" },
] as const;
const COUNTERTOP_FINISHES = [
  { name: "Quartz", color: "#e9e7e2" },
  { name: "Carrara", color: "#d7d7d3" },
  { name: "Soapstone", color: "#3d4245" },
  { name: "Sand", color: "#c9b8a1" },
  { name: "Black", color: "#202124" },
] as const;
export const THREE_D_EXPORT_SIZE = { width: 2000, height: 1400 } as const;
export const THREE_D_DRAWER_REVEAL_DEPTH = 0.07;

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolvedThreeDDrawerRows(sku: Pick<SceneSku, "drawerLayout">, availableHeight: number, fallbackCount: number) {
  try {
    const parsed = JSON.parse(sku.drawerLayout ?? "null");
    if (Array.isArray(parsed) && parsed.length) {
      const rows = parsed
        .map((row) => ({
          count: Math.max(1, Number((row as Record<string, unknown>).count) || 1),
          height: Math.max(0.12, Number((row as Record<string, unknown>).height) * INCH || availableHeight / parsed.length),
        }))
        .filter((row) => Number.isFinite(row.count) && Number.isFinite(row.height));
      if (rows.length) return rows;
    }
  } catch {
    // Older placements may not have a valid JSON drawer layout. Use counts.
  }
  const count = Math.max(0, fallbackCount);
  return count ? Array.from({ length: count }, () => ({ count: 1, height: availableHeight / count })) : [];
}

export function describedOvenSpecification(description: string | null | undefined) {
  const source = description ?? "";
  const opening = source.match(/(\d+(?:\.\d+)?)\s*(?:["″]|in)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:["″]|in)?\s*oven\s+opening/i);
  const doors = source.match(/(\d+)\s*doors?/i);
  const drawers = source.match(/(\d+)\s*drawers?/i);
  return {
    openingWidth: opening ? Number(opening[1]) : null,
    openingHeight: opening ? Number(opening[2]) : null,
    doorCount: doors ? Number(doors[1]) : null,
    drawerCount: drawers ? Number(drawers[1]) : null,
  };
}

export function resolvedThreeDOvenLayout(input: {
  height: unknown;
  description?: string | null;
  numberOfDoors?: number | null;
  numberOfDrawers?: number | null;
  doorHeight?: number | null;
  drawerHeight?: number | null;
  drawerLayout?: string | null;
  openingType?: string | null;
  ovenType?: "single" | "double" | null;
}) {
  const totalHeight = numberValue(input.height, 84) * INCH;
  const usableHeight = Math.max(0.2, totalHeight - 0.08);
  const described = describedOvenSpecification(input.description);
  const ovenCount = input.ovenType === "double" ? 2 : 1;
  const doorCount = input.numberOfDoors != null && input.numberOfDoors > 0
    ? input.numberOfDoors
    : described.doorCount ?? (input.numberOfDoors === 0 ? 0 : 2);
  const drawerCount = input.numberOfDrawers != null && input.numberOfDrawers > 0
    ? input.numberOfDrawers
    : described.drawerCount ?? (input.numberOfDrawers === 0 ? 0 : ovenCount === 2 ? 1 : 3);
  const requestedDrawerHeight = input.drawerHeight != null
    ? Math.max(0, Number(input.drawerHeight) * INCH)
    : drawerCount * 5 * INCH;
  const requestedRows = resolvedThreeDDrawerRows({ drawerLayout: input.drawerLayout ?? null }, requestedDrawerHeight, drawerCount);
  const measuredOpeningHeight = described.openingHeight != null ? described.openingHeight * INCH : null;
  const doorZone = doorCount
    ? input.doorHeight != null
      ? Math.min(usableHeight * 0.7, Math.max(0, Number(input.doorHeight) * INCH))
      : measuredOpeningHeight != null
        ? Math.max(0, usableHeight - measuredOpeningHeight - requestedRows.reduce((sum, row) => sum + row.height, 0))
        : usableHeight * 0.2
    : 0;
  const requestedDrawerZone = requestedRows.reduce((sum, row) => sum + row.height, 0);
  const availableDrawerZone = Math.max(0, usableHeight - doorZone - (measuredOpeningHeight ?? usableHeight * 0.15));
  const drawerScale = requestedDrawerZone > availableDrawerZone && requestedDrawerZone > 0 ? availableDrawerZone / requestedDrawerZone : 1;
  const drawerRows = requestedRows.map((row) => ({ ...row, height: row.height * drawerScale }));
  const drawerZone = drawerRows.reduce((sum, row) => sum + row.height, 0);
  return {
    usableHeight,
    doorCount,
    doorZone,
    drawerRows,
    drawerZone,
    openingHeight: Math.max(0.12, usableHeight - doorZone - drawerZone),
    openingPosition: input.openingType === "top" || input.openingType === "bottom" ? input.openingType : "middle" as const,
    ovenCount,
  };
}

export function rangeHoodGeometry(widthIn: number, heightIn: number, depthIn: number) {
  const width = widthIn * INCH;
  const height = heightIn * INCH;
  const depth = depthIn * INCH;
  const canopyHeight = Math.max(0.14, Math.min(height * 0.34, 0.46));
  return {
    width,
    depth,
    height,
    canopyHeight,
    chimneyWidth: Math.max(0.18, width * 0.42),
    chimneyDepth: Math.max(0.12, depth * 0.46),
    chimneyHeight: Math.max(0.1, height - canopyHeight),
  };
}

export function dimensions(value: unknown) {
  const object = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    width: numberValue(object.width, 144),
    depth: numberValue(object.depth, 120),
    ceilingHeight: numberValue(object.ceilingHeight, 96),
  };
}

export function sceneCabinetColor(scene: InteractiveRoomScene) {
  const color = scene.materials?.cabinet.color?.trim() ?? "";
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const source = `${scene.materials?.cabinet.finish ?? ""} ${color}`.toLowerCase();
  if (/(black|charcoal|obsidian|graphite)/.test(source)) return "#34363a";
  if (/(navy|blue|ocean)/.test(source)) return "#435b77";
  if (/(green|sage|forest)/.test(source)) return "#78826b";
  if (/(walnut|espresso|brown|mocha)/.test(source)) return "#75523e";
  if (/(oak|maple|honey|natural)/.test(source)) return "#c69a63";
  if (/(cream|beige|linen|almond)/.test(source)) return "#ded5c1";
  return "#f2f0ea";
}

export function resolvedCatalogFinish(scene: InteractiveRoomScene, catalogFinishOverride?: string | null) {
  const override = catalogFinishOverride?.trim() ?? "";
  return /^#[0-9a-f]{6}$/i.test(override) ? override : sceneCabinetColor(scene);
}

export function resolvedThreeDDoorSampleUrl(cabinetFinish: string, catalogDoorSampleUrl?: string | null, preferSelectedPlanSample = false) {
  const sample = catalogDoorSampleUrl?.trim() ?? "";
  return (preferSelectedPlanSample || cabinetFinish === "catalog") && sample ? sample : null;
}

export function shouldRenderPlacedDesign(placed: PlacedCabinet[]) {
  return placed.length > 0;
}

export function quoteMaterialDetails(input: {
  cabinetPreview: string;
  countertopPreview: string;
  catalogFinishName?: string | null;
  catalogCountertopName?: string | null;
}) {
  return {
    cabinet: input.cabinetPreview === "Catalog finish" ? input.catalogFinishName?.trim() || "Catalog finish" : input.cabinetPreview,
    countertop: input.countertopPreview === "Quartz" ? input.catalogCountertopName?.trim() || "Quartz" : input.countertopPreview,
  };
}

export function doorProfileKind(doorStyle: string | null | undefined, doorPanelType: string | null | undefined) {
  const profile = `${doorStyle ?? ""} ${doorPanelType ?? ""}`.toLowerCase();
  if (/raised|bevel|cathedral/.test(profile)) return "raised" as const;
  if (/shaker|recessed|frame/.test(profile)) return "shaker" as const;
  return "flat" as const;
}

/** Three-inch physical Shaker rail/stile, reduced only when a very narrow face cannot accommodate it. */
export function threeDShakerRailThickness(faceWidth: number, faceHeight: number) {
  return Math.max(0, Math.min(3 * INCH, faceWidth / 2 - 0.01, faceHeight / 2 - 0.01));
}

function roomPolygon(geometryTemplate: unknown, width: number, depth: number) {
  const geometry = geometryTemplate && typeof geometryTemplate === "object" && !Array.isArray(geometryTemplate)
    ? geometryTemplate as Record<string, unknown>
    : {};
  const raw = Array.isArray(geometry.vertices) ? geometry.vertices : [];
  const points = raw
    .map((vertex) => vertex && typeof vertex === "object" ? vertex as Record<string, unknown> : {})
    .map((vertex) => new THREE.Vector2(
      Math.max(0, Math.min(width, numberValue(vertex.x, 0) * width)) * INCH,
      -Math.max(0, Math.min(depth, numberValue(vertex.y, 0) * depth)) * INCH,
    ));
  return points.length >= 3
    ? points
    : [new THREE.Vector2(0, 0), new THREE.Vector2(width * INCH, 0), new THREE.Vector2(width * INCH, -depth * INCH), new THREE.Vector2(0, -depth * INCH)];
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose?.();
  });
}

export function resolvedThreeDFaceLayout(input: {
  placementType?: string | null;
  numberOfDoors?: number | null;
  numberOfDrawers?: number | null;
  openingType?: string | null;
}) {
  const placement = (input.placementType ?? "base").toLowerCase();
  const isWallOrTall = placement === "wall" || placement === "tall";
  return {
    hasConfiguredOpening: Boolean(input.openingType && input.openingType !== "none"),
    doorCount: input.numberOfDoors == null ? (isWallOrTall ? 2 : 1) : Math.max(0, input.numberOfDoors),
    drawerCount: Math.max(0, input.numberOfDrawers ?? 0),
  };
}

export function resolvedThreeDSpecialtyProfile(sku: Pick<SceneSku, "graphicType" | "customProfile" | "facePattern" | "cornerType" | "masterCode" | "description">) {
  const graphic = `${sku.graphicType ?? ""} ${sku.customProfile ?? ""}`.toLowerCase();
  if (sku.facePattern) return { kind: "face-pattern" as const, pattern: sku.facePattern };
  if (/end-angle|base_end_angle|end-return|base_end_return/.test(graphic)) return { kind: "end-return" as const, pattern: null };
  if (sku.cornerType === "diagonal") return { kind: "diagonal-corner" as const, pattern: null };
  if (/\b(?:wine|lattice|plate)\b/i.test(`${sku.masterCode} ${sku.description ?? ""}`)) return { kind: "face-pattern" as const, pattern: "lattice" as const };
  return { kind: "standard" as const, pattern: null };
}

function addCabinet(
  root: THREE.Group,
  sku: SceneSku,
  wallKey: string | null,
  cursor: Record<string, number>,
  roomWidth: number,
  roomDepth: number,
  color: string,
  counterColor: string,
  doorProfile?: { doorStyle: string | null; doorPanelType: string | null },
  transform?: { x: number; z: number; rotation: number; bottom?: number },
  doorSampleUrl?: string | null,
) {
  const placement = (sku.placementType ?? "base").toLowerCase();
  const isWall = placement === "wall";
  const isTall = placement === "tall";
  const widthIn = numberValue(sku.width, 24);
  const depthIn = numberValue(sku.depth, isWall ? WALL_DEPTH : BASE_DEPTH);
  const heightIn = numberValue(sku.height, isWall ? 30 : isTall ? 84 : 34.5);
  const key = wallKey === "left" ? "left" : wallKey === "right" ? "right" : wallKey === "front" ? "front" : "back";
  const along = cursor[key] ?? 3;
  cursor[key] = along + widthIn + 1.5;

  let x = along + widthIn / 2;
  let z = depthIn / 2;
  let rotation = 0;
  if (key === "front") { z = roomDepth - depthIn / 2; rotation = Math.PI; }
  if (key === "left") { x = depthIn / 2; z = along + widthIn / 2; rotation = Math.PI / 2; }
  if (key === "right") { x = roomWidth - depthIn / 2; z = along + widthIn / 2; rotation = -Math.PI / 2; }
  if (transform) ({ x, z, rotation } = transform);

  const bodyWidth = (key === "left" || key === "right" ? depthIn : widthIn) * INCH;
  const bodyDepth = (key === "left" || key === "right" ? widthIn : depthIn) * INCH;
  const bodyHeight = heightIn * INCH;
  const bottom = transform?.bottom ?? (isWall ? WALL_BOTTOM : 0);
  const cabinet = new THREE.Group();
  cabinet.position.set(x * INCH, (bottom + heightIn / 2) * INCH, z * INCH);
  cabinet.rotation.y = rotation;
  cabinet.userData = { distributorSkuId: sku.distributorSkuId, masterCode: sku.masterCode, label: sku.description ?? sku.masterCode };

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth),
    new THREE.MeshStandardMaterial({ color: "#c6b9a7", roughness: 0.72 }),
  );
  cabinet.add(body);

  const doorTexture = doorSampleUrl ? new THREE.TextureLoader().load(doorSampleUrl) : null;
  if (doorTexture) {
    doorTexture.colorSpace = THREE.SRGBColorSpace;
    doorTexture.wrapS = THREE.RepeatWrapping;
    doorTexture.wrapT = THREE.RepeatWrapping;
    doorTexture.repeat.set(1.35, 1.35);
  }
  // A material color multiplies a texture in Three.js. Keep textured faces neutral
  // so the exact selected 2D sample remains visible rather than being tinted by
  // the catalog fallback color (which previously turned Silva Shaker flat gold).
  const faceColor = doorTexture ? "#ffffff" : color;
  const faceMaterial = new THREE.MeshStandardMaterial({ color: faceColor, map: doorTexture, roughness: 0.46, metalness: 0.02 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: faceColor, map: doorTexture, roughness: 0.38, metalness: 0.01 });
  const drawerRevealMaterial = new THREE.LineBasicMaterial({ color: "#302a24", transparent: true, opacity: 0.58 });
  // The cabinet carcass is part of the visible finished run in the 2D design.
  // Match it to the selected face material so 3D does not introduce white side
  // panels and apparent gaps between flush placed cabinets.
  const bodyMaterial = body.material as THREE.MeshStandardMaterial;
  bodyMaterial.color.set(faceColor);
  bodyMaterial.map = doorTexture;
  bodyMaterial.needsUpdate = true;
  const faceDepth = bodyDepth / 2 + 0.015;
  const { hasConfiguredOpening, doorCount, drawerCount } = resolvedThreeDFaceLayout(sku);
  const usableHeight = bodyHeight - 0.08;
  const configuredDrawerHeight = sku.drawerHeight != null ? numberValue(sku.drawerHeight, 0) * INCH : 0;
  const drawerHeight = drawerCount ? Math.min(usableHeight * 0.6, configuredDrawerHeight || usableHeight * 0.35) : 0;
  const configuredDoorHeight = sku.doorHeight != null ? numberValue(sku.doorHeight, 0) * INCH : 0;
  const doorHeight = Math.max(0.2, configuredDoorHeight || usableHeight - drawerHeight);
  const frontGroup = new THREE.Group();
  frontGroup.position.z = faceDepth;
  const profileKind = doorProfileKind(doorProfile?.doorStyle, doorProfile?.doorPanelType);
  const addShakerFrame = (faceWidth: number, faceHeight: number, x: number, y: number, z = 0.036) => {
    if (profileKind !== "shaker") return;
    const rail = threeDShakerRailThickness(faceWidth, faceHeight);
    if (!rail) return;
    const pieces = [
      [faceWidth, rail, 0, faceHeight / 2 - rail / 2],
      [faceWidth, rail, 0, -faceHeight / 2 + rail / 2],
      [rail, Math.max(0.02, faceHeight - rail * 2), -faceWidth / 2 + rail / 2, 0],
      [rail, Math.max(0.02, faceHeight - rail * 2), faceWidth / 2 - rail / 2, 0],
    ] as const;
    for (const [pieceWidth, pieceHeight, offsetX, offsetY] of pieces) {
      const railMesh = new THREE.Mesh(new THREE.BoxGeometry(pieceWidth, pieceHeight, 0.026), trimMaterial);
      railMesh.position.set(x + offsetX, y + offsetY, z);
      frontGroup.add(railMesh);
    }
  };
  const addDrawerReveal = (faceWidth: number, faceHeight: number, x: number, y: number, z = THREE_D_DRAWER_REVEAL_DEPTH) => {
    const reveal = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(faceWidth, faceHeight, 0.01)),
      drawerRevealMaterial,
    );
    reveal.position.set(x, y, z);
    frontGroup.add(reveal);
  };
  const isPlacedAppliance = placement === "appliance";
  const isOvenCabinet = !isPlacedAppliance && Boolean(sku.ovenType || /(?:^|[-_])(UOC|OC|OVEN)|oven cabinet/i.test(sku.masterCode + " " + (sku.description ?? "")));
  const specialty = resolvedThreeDSpecialtyProfile(sku);
  if (isPlacedAppliance) {
    const applianceMaterial = new THREE.MeshStandardMaterial({ color: "#c7cbd0", roughness: 0.24, metalness: 0.62 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: "#1f2933", roughness: 0.18, metalness: 0.35 });
    const code = sku.masterCode.toUpperCase();
    if (/HOOD/.test(code)) {
      const hood = rangeHoodGeometry(widthIn, heightIn, depthIn);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(hood.width * 0.96, hood.canopyHeight, hood.depth * 0.92), applianceMaterial);
      canopy.position.set(0, -bodyHeight / 2 + hood.canopyHeight / 2, 0.025);
      canopy.userData = { applianceCode: sku.masterCode, rangeHoodCanopy: true };
      frontGroup.add(canopy);
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(hood.chimneyWidth, hood.chimneyHeight, hood.chimneyDepth), applianceMaterial);
      chimney.position.set(0, bodyHeight / 2 - hood.chimneyHeight / 2, -hood.depth * 0.13);
      chimney.userData = { applianceCode: sku.masterCode, rangeHoodChimney: true };
      frontGroup.add(chimney);
      const intake = new THREE.Mesh(new THREE.BoxGeometry(hood.width * 0.72, Math.max(0.035, hood.canopyHeight * 0.14), 0.07), glassMaterial);
      intake.position.set(0, -bodyHeight / 2 + hood.canopyHeight * 0.48, 0.07);
      frontGroup.add(intake);
    } else {
      const applianceFace = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth - 0.06, bodyHeight - 0.06, 0.05), applianceMaterial);
      frontGroup.add(applianceFace);
      const openingH = /FRIDGE/.test(code) ? bodyHeight * 0.67 : /SINK/.test(code) ? bodyHeight * 0.56 : bodyHeight * 0.62;
      const opening = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.68, openingH, 0.064), glassMaterial);
      opening.position.y = /RANGE|DW|WINE|MW/.test(code) ? -bodyHeight * 0.03 : bodyHeight * 0.04;
      opening.userData = { applianceCode: sku.masterCode, applianceOpening: true };
      frontGroup.add(opening);
      const control = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.76, Math.min(0.08, bodyHeight * 0.12), 0.066), new THREE.MeshStandardMaterial({ color: "#3b4147", roughness: 0.3, metalness: 0.45 }));
      control.position.y = bodyHeight / 2 - Math.min(0.1, bodyHeight * 0.14);
      frontGroup.add(control);
    }
  } else if (isOvenCabinet) {
    // An oven cabinet is a finished tall enclosure. Its door zone, appliance
    // cut-out, and each drawer row are taken from the saved 2D configuration.
    const surround = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth - 0.06, bodyHeight - 0.06, 0.045), faceMaterial);
    frontGroup.add(surround);
    const ovenLayout = resolvedThreeDOvenLayout({
      height: sku.height,
      description: sku.description,
      numberOfDoors: sku.numberOfDoors,
      numberOfDrawers: sku.numberOfDrawers,
      doorHeight: sku.doorHeight,
      drawerHeight: sku.drawerHeight,
      drawerLayout: sku.drawerLayout,
      openingType: sku.openingType,
      ovenType: sku.ovenType,
    });
    const applianceMaterial = new THREE.MeshStandardMaterial({ color: "#c7cbd0", roughness: 0.24, metalness: 0.62 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: "#1f2933", roughness: 0.18, metalness: 0.35 });
    let zoneTop = bodyHeight / 2 - 0.04;
    const addDoors = (height: number) => {
      if (!height || !ovenLayout.doorCount) return;
      const doorWidth = (bodyWidth - 0.08) / ovenLayout.doorCount;
      for (let i = 0; i < ovenLayout.doorCount; i++) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.03, Math.max(0.08, height - 0.025), 0.052), faceMaterial);
        door.position.set(-bodyWidth / 2 + 0.04 + doorWidth * (i + 0.5), zoneTop - height / 2, 0.035);
        frontGroup.add(door);
        addShakerFrame(doorWidth - 0.03, Math.max(0.08, height - 0.025), door.position.x, door.position.y, 0.066);
      }
      zoneTop -= height;
    };
    const addDrawers = () => {
      for (const row of ovenLayout.drawerRows) {
        const drawerWidth = (bodyWidth - 0.08) / row.count;
        for (let column = 0; column < row.count; column++) {
          const drawer = new THREE.Mesh(new THREE.BoxGeometry(drawerWidth - 0.025, Math.max(0.08, row.height - 0.025), 0.052), faceMaterial);
          drawer.position.set(-bodyWidth / 2 + 0.04 + drawerWidth * (column + 0.5), zoneTop - row.height / 2, 0.035);
          frontGroup.add(drawer);
          addDrawerReveal(drawerWidth - 0.025, Math.max(0.08, row.height - 0.025), drawer.position.x, drawer.position.y);
          addShakerFrame(drawerWidth - 0.025, Math.max(0.08, row.height - 0.025), drawer.position.x, drawer.position.y, 0.066);
        }
        zoneTop -= row.height;
      }
    };
    const addOvenCutout = () => {
      const oven = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.82, ovenLayout.openingHeight, 0.07), applianceMaterial);
      oven.position.set(0, zoneTop - ovenLayout.openingHeight / 2, 0.032);
      frontGroup.add(oven);
      const singleOvenHeight = ovenLayout.openingHeight / ovenLayout.ovenCount;
      for (let i = 0; i < ovenLayout.ovenCount; i++) {
        const glass = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.65, singleOvenHeight * 0.62, 0.078), glassMaterial);
        glass.position.set(0, zoneTop - singleOvenHeight * (i + 0.5), 0.072);
        frontGroup.add(glass);
      }
      zoneTop -= ovenLayout.openingHeight;
    };
    if (ovenLayout.openingPosition === "top") {
      addOvenCutout();
      addDoors(ovenLayout.doorZone);
      addDrawers();
    } else if (ovenLayout.openingPosition === "bottom") {
      addDoors(ovenLayout.doorZone);
      addDrawers();
      addOvenCutout();
    } else {
      addDoors(ovenLayout.doorZone);
      addOvenCutout();
      addDrawers();
    }
  } else if (specialty.kind === "end-return") {
    // BEC / BA end-return cabinets are 24-by-24 end pieces, not flat base boxes.
    // Build two center-meeting textured faces to preserve the 2D end-angle read.
    const faceWidth = (bodyWidth - 0.1) / 2;
    const faceHeight = Math.max(0.2, bodyHeight - 0.1);
    for (const direction of [-1, 1] as const) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(faceWidth - 0.03, faceHeight, 0.05), faceMaterial);
      door.position.set(direction * faceWidth * 0.24, 0, 0.035);
      door.rotation.y = direction * Math.PI / 4;
      door.userData = { specialtyProfile: "end-return", returnFace: direction === -1 ? "left" : "right" };
      frontGroup.add(door);
      addShakerFrame(faceWidth - 0.03, faceHeight, door.position.x, door.position.y, 0.066);
    }
  } else if (specialty.kind === "face-pattern") {
    const recess = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth - 0.1, bodyHeight - 0.1, 0.03),
      new THREE.MeshStandardMaterial({ color: "#382e26", roughness: 0.7 }),
    );
    recess.position.z = 0.018;
    recess.userData = { specialtyProfile: "face-pattern", pattern: specialty.pattern };
    frontGroup.add(recess);
    const barMaterial = new THREE.MeshStandardMaterial({ color: faceColor, map: doorTexture, roughness: 0.42 });
    const barCount = specialty.pattern === "slats" ? 5 : 4;
    for (let index = 0; index < barCount; index++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.055, bodyHeight - 0.14, 0.058), barMaterial);
      bar.position.set(-bodyWidth / 2 + 0.09 + (bodyWidth - 0.18) * (index / Math.max(1, barCount - 1)), 0, 0.052);
      if (specialty.pattern === "lattice" || specialty.pattern === "criss-cross") bar.rotation.z = index % 2 ? Math.PI / 4 : -Math.PI / 4;
      frontGroup.add(bar);
    }
  } else {
  for (let i = 0; i < doorCount; i++) {
    const doorWidth = (bodyWidth - 0.08) / doorCount;
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.03, doorHeight, 0.045), faceMaterial);
    door.position.set(-bodyWidth / 2 + 0.04 + doorWidth * (i + 0.5), -bodyHeight / 2 + 0.04 + doorHeight / 2, 0);
    frontGroup.add(door);
    const isRaised = profileKind === "raised";
    if (profileKind === "shaker") {
      addShakerFrame(doorWidth - 0.03, doorHeight, door.position.x, door.position.y);
    } else if (isRaised) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(doorWidth * 0.72, doorHeight * 0.72, 0.052), trimMaterial);
      panel.position.set(door.position.x, door.position.y, 0.045);
      frontGroup.add(panel);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(doorWidth * 0.57, doorHeight * 0.57, 0.025), faceMaterial);
      inner.position.set(door.position.x, door.position.y, 0.08);
      frontGroup.add(inner);
    }
  }
  const drawerRows = resolvedThreeDDrawerRows(sku, drawerHeight, drawerCount);
  let drawerCursor = hasConfiguredOpening ? -bodyHeight / 2 + 0.04 : bodyHeight / 2 - 0.04;
  for (const row of drawerRows) {
    const rowHeight = Math.max(0.08, row.height - 0.025);
    const drawerWidth = (bodyWidth - 0.08) / row.count;
    for (let column = 0; column < row.count; column++) {
      const drawer = new THREE.Mesh(new THREE.BoxGeometry(drawerWidth - 0.025, rowHeight, 0.048), faceMaterial);
      const rowY = hasConfiguredOpening ? drawerCursor + row.height / 2 : drawerCursor - row.height / 2;
      drawer.position.set(-bodyWidth / 2 + 0.04 + drawerWidth * (column + 0.5), rowY, 0.004);
      frontGroup.add(drawer);
      addDrawerReveal(drawerWidth - 0.025, rowHeight, drawer.position.x, drawer.position.y);
      addShakerFrame(drawerWidth - 0.025, rowHeight, drawer.position.x, drawer.position.y);
    }
    drawerCursor += hasConfiguredOpening ? row.height : -row.height;
  }
  if (hasConfiguredOpening && doorCount === 0) {
    const openingHeight = Math.max(0.2, usableHeight - drawerHeight);
    const opening = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth - 0.11, openingHeight - 0.03, 0.052),
      new THREE.MeshStandardMaterial({ color: "#343a43", roughness: 0.5, metalness: 0.2 }),
    );
    opening.position.set(0, bodyHeight / 2 - 0.04 - openingHeight / 2, 0.006);
    opening.userData = { configuredOpening: true, openingType: sku.openingType };
    frontGroup.add(opening);
  }
  }
  cabinet.add(frontGroup);
  cabinet.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth)), new THREE.LineBasicMaterial({ color: "#332d25", transparent: true, opacity: 0.34 })));
  root.add(cabinet);

  if (!isWall && !isTall && placement !== "accessory" && !isPlacedAppliance) {
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth + 0.12, 1.5 * INCH, bodyDepth + 0.12),
      new THREE.MeshStandardMaterial({ color: counterColor, roughness: 0.33, metalness: 0.03 }),
    );
    counter.position.copy(cabinet.position);
    counter.rotation.y = rotation;
    counter.position.y = COUNTERTOP_H * INCH;
    root.add(counter);
  }
}

export function existingCabinetTransform(cabinet: PlacedCabinet) {
  // Placed coordinates are the top-left of the 2D rotation-aware footprint.
  // Using nominal width/depth here offsets rotated runs by up to half a cabinet,
  // producing artificial gaps in the 3D scene.
  const footprint = placedFootprint(cabinet);
  const width = numberValue(footprint.w, 24);
  const depth = numberValue(footprint.d, BASE_DEPTH);
  const savedRotation = Number(cabinet.rotation);
  const rotation = Number.isFinite(savedRotation) ? savedRotation * Math.PI / 180 : 0;
  const bottom = cabinet.placement === "wall"
    ? numberValue(cabinet.mountBottom, WALL_BOTTOM)
    : cabinet.placement === "appliance" && cabinet.mountBottom != null
      ? numberValue(cabinet.mountBottom, 0)
    : cabinet.placement === "baseTop"
      ? STD.BASE_HEIGHT - numberValue(cabinet.height, 6)
      : cabinet.placement === "underCabinet"
        ? WALL_BOTTOM - numberValue(cabinet.height, 6)
        : 0;
  return { x: cabinet.x + width / 2, z: cabinet.y + depth / 2, rotation, bottom };
}

export function sinkFixtureTransform(sink: SinkFixture) {
  return {
    x: (sink.x + sink.width / 2) * INCH,
    z: (sink.y + sink.depth / 2) * INCH,
    countertopTop: COUNTERTOP_H * INCH,
  };
}

function addSinkFixture(root: THREE.Group, sink: SinkFixture) {
  const width = sink.width * INCH;
  const depth = sink.depth * INCH;
  const { x: centerX, z: centerZ, countertopTop } = sinkFixtureTransform(sink);
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.06, depth),
    new THREE.MeshStandardMaterial({ color: "#9ba8af", metalness: 0.58, roughness: 0.28 }),
  );
  rim.position.set(centerX, countertopTop + 0.025, centerZ);
  root.add(rim);
  const bowl = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.2, width - 0.14), 0.16, Math.max(0.2, depth - 0.14)),
    new THREE.MeshStandardMaterial({ color: "#33414a", metalness: 0.44, roughness: 0.24 }),
  );
  bowl.position.set(centerX, countertopTop - 0.07, centerZ);
  root.add(bowl);
  if (!sink.faucet) return;
  const faucetMaterial = new THREE.MeshStandardMaterial({ color: "#c4d0d7", metalness: 0.76, roughness: 0.16 });
  const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.52, 12), faucetMaterial);
  riser.position.set(centerX, countertopTop + 0.27, centerZ + depth * 0.26);
  root.add(riser);
  const spout = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.026, 8, 16, Math.PI), faucetMaterial);
  spout.rotation.x = Math.PI / 2;
  spout.position.set(centerX, countertopTop + 0.48, centerZ + depth * 0.08);
  root.add(spout);
}

export function openingTransform(opening: WallOpening, roomWidth: number, roomDepth: number) {
  const offset = opening.offset + opening.width / 2;
  if (opening.side === "bottom") return { x: offset, z: roomDepth - 0.06, rotation: Math.PI };
  if (opening.side === "left") return { x: 0.06, z: offset, rotation: Math.PI / 2 };
  if (opening.side === "right") return { x: roomWidth - 0.06, z: offset, rotation: -Math.PI / 2 };
  return { x: offset, z: 0.06, rotation: 0 };
}

function addWallOpening(root: THREE.Group, opening: WallOpening, roomWidth: number, roomDepth: number) {
  const { x, z, rotation } = openingTransform(opening, roomWidth, roomDepth);
  const group = new THREE.Group();
  group.position.set(x * INCH, (opening.sill + opening.height / 2) * INCH, z * INCH);
  group.rotation.y = rotation;
  group.userData = { openingUid: opening.uid, kind: opening.kind, label: opening.label };
  const width = opening.width * INCH;
  const height = opening.height * INCH;
  group.add(new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, height + 0.08, 0.07), new THREE.MeshStandardMaterial({ color: "#f4f0e8", roughness: 0.5 })));
  const isWindow = opening.kind === "window";
  const pane = new THREE.Mesh(new THREE.BoxGeometry(width - 0.08, height - 0.08, 0.08), new THREE.MeshStandardMaterial({ color: isWindow ? "#a9c9dc" : "#4a3528", roughness: 0.28, metalness: isWindow ? 0.12 : 0 }));
  pane.position.z = 0.01;
  group.add(pane);
  if (isWindow) {
    const muntin = new THREE.MeshStandardMaterial({ color: "#f7f5ef", roughness: 0.45 });
    group.add(
      new THREE.Mesh(new THREE.BoxGeometry(0.04, height - 0.05, 0.09), muntin),
      new THREE.Mesh(new THREE.BoxGeometry(width - 0.05, 0.04, 0.09), muntin),
    );
  }
  root.add(group);
}

function existingCabinetSku(cabinet: PlacedCabinet): SceneSku {
  return {
    distributorSkuId: -(Math.abs(cabinet.cabinetId) || 1),
    cabinetId: cabinet.cabinetId,
    masterCode: cabinet.masterCode,
    description: cabinet.description,
    placementType: cabinet.placement,
    width: cabinet.width,
    height: cabinet.height ?? (cabinet.placement === "wall" ? STD.WALL_HEIGHT : cabinet.placement === "tall" ? STD.TALL_HEIGHT : STD.BASE_HEIGHT),
    depth: cabinet.depth,
    numberOfDoors: cabinet.numberOfDoors ?? null,
    numberOfDrawers: cabinet.numberOfDrawers ?? null,
    openingType: cabinet.openingType ?? null,
    doorHeight: cabinet.doorHeight ?? null,
    drawerHeight: cabinet.drawerHeight ?? null,
    drawerLayout: cabinet.drawerLayout ?? null,
    ovenType: cabinet.ovenType ?? null,
    graphicType: cabinet.customProfile ?? null,
    customProfile: cabinet.customProfile ?? null,
    facePattern: cabinet.facePattern ?? null,
    cornerType: cabinet.cornerType ?? null,
  };
}

export function InteractiveRoom3D({ scene, placed = [], roomOverride, openings = [], sinks = [], orderSummary, orderLines = [], initialPresentation, catalogFinishOverride, catalogDoorSampleUrl, catalogFinishName, catalogCountertopName, shareContext, catalogItems = [], onAddCatalogItem, onSaveToAccount, onPresentationChange, className }: Props) {
  const previewRootRef = useRef<HTMLElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const catalogRootRef = useRef<THREE.Group | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [cabinetFinish, setCabinetFinish] = useState(initialPresentation?.cabinetFinish ?? "catalog");
  const [countertopFinish, setCountertopFinish] = useState(initialPresentation?.countertopFinish ?? scene.materials?.defaults.countertop ?? "#e9e7e2");
  const [materialTransitioning, setMaterialTransitioning] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [draggedCatalogId, setDraggedCatalogId] = useState<string | null>(null);
  const [selectedCabinet, setSelectedCabinet] = useState<{ masterCode: string; description: string | null; distributorSkuId: number | null } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const validSuggestions = useMemo(() => scene.suggestions.filter((entry) => entry.sku), [scene.suggestions]);
  const renderExistingDesign = shouldRenderPlacedDesign(placed);
  // The active designer style is the customer’s catalog selection. Prefer its
  // resolved finish color over a sparse style-record color field from the scene
  // endpoint, then fall back to the server-derived catalog material.
  const catalogFinish = resolvedCatalogFinish(scene, catalogFinishOverride);
  const resolvedCabinetFinish = cabinetFinish === "catalog" ? catalogFinish : cabinetFinish;
  const cabinetFinishLabel = CABINET_FINISHES.find((option) => option.color === cabinetFinish)?.name ?? "Custom finish";
  const countertopFinishLabel = COUNTERTOP_FINISHES.find((option) => option.color === countertopFinish)?.name ?? "Custom countertop";
  const quoteMaterials = quoteMaterialDetails({
    cabinetPreview: cabinetFinishLabel,
    countertopPreview: countertopFinishLabel,
    catalogFinishName: catalogFinishName ?? scene.materials?.cabinet.publicName ?? scene.materials?.cabinet.name ?? scene.materials?.cabinet.finish,
    catalogCountertopName,
  });
  const shareMutation = trpc.roomLayouts.createShare.useMutation();
  const emailQuoteMutation = trpc.roomLayouts.emailQuote.useMutation();

  useEffect(() => {
    setCabinetFinish(initialPresentation?.cabinetFinish ?? "catalog");
    setCountertopFinish(initialPresentation?.countertopFinish ?? scene.materials?.defaults.countertop ?? "#e9e7e2");
  }, [scene.materials?.cabinet.color, scene.materials?.cabinet.finish, scene.materials?.defaults.countertop, initialPresentation?.cabinetFinish, initialPresentation?.countertopFinish]);

  useEffect(() => {
    setMaterialTransitioning(true);
    const timer = window.setTimeout(() => setMaterialTransitioning(false), 340);
    return () => window.clearTimeout(timer);
  }, [cabinetFinish, countertopFinish]);

  useEffect(() => {
    onPresentationChange?.({ cabinetFinish, countertopFinish });
  }, [cabinetFinish, countertopFinish, onPresentationChange]);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(document.fullscreenElement === previewRootRef.current);
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const toggleFullscreen = async () => {
    const element = previewRootRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement === element) await document.exitFullscreen();
      else await element.requestFullscreen();
    } catch {
      toast.error("Full-screen view is not available in this browser.");
    }
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || (!scene.roomShape && !roomOverride)) return;
    const room = roomOverride
      ? { width: roomOverride.width, depth: roomOverride.depth, ceilingHeight: roomOverride.ceilingHeight ?? STD.WALL_HEIGHT + WALL_BOTTOM }
      : dimensions(scene.roomShape?.defaultDimensions);
    const canvasWidth = Math.max(280, mount.clientWidth);
    const canvasHeight = Math.max(280, mount.clientHeight || 420);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    } catch {
      setWebglUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvasWidth, canvasHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mount.replaceChildren(renderer.domElement);

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color("#f6f3ed");
    const camera = new THREE.PerspectiveCamera(42, canvasWidth / canvasHeight, 0.1, 100);
    const maxSpan = Math.max(room.width, room.depth) * INCH;
    camera.position.set(maxSpan * 1.15, maxSpan * 0.92, maxSpan * 1.25);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(room.width * INCH * 0.5, 3.1, room.depth * INCH * 0.45);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.68;
    controls.zoomSpeed = 0.84;
    controls.panSpeed = 0.72;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = Math.PI / 2.02;
    controls.minDistance = 3;
    controls.maxDistance = Math.max(14, maxSpan * 3.4);
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.1;
    controls.update();

    threeScene.add(new THREE.HemisphereLight("#fff8eb", "#526174", 2.2));
    const keyLight = new THREE.DirectionalLight("#fff6e8", 3.1);
    keyLight.position.set(maxSpan, maxSpan * 1.8, maxSpan * 0.8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = maxSpan * 4;
    threeScene.add(keyLight);
    const fillLight = new THREE.DirectionalLight("#b7d1ef", 1.05);
    fillLight.position.set(-maxSpan, maxSpan, maxSpan);
    threeScene.add(fillLight);
    const wallHeight = room.ceilingHeight * INCH;
    const warmLight = new THREE.PointLight("#ffdca6", 18, maxSpan * 3.2, 2);
    warmLight.position.set(room.width * INCH * 0.52, wallHeight * 0.76, room.depth * INCH * 0.48);
    threeScene.add(warmLight);

    const materialDefaults = { ...(scene.materials?.defaults ?? { floor: "#b89778", countertop: "#e9e7e2", backsplash: "#d9d5cc", wall: "#efece6" }), countertop: countertopFinish };
    const polygon = roomPolygon(
      roomOverride?.vertices?.length ? { vertices: roomOverride.vertices } : scene.roomShape?.geometryTemplate,
      room.width,
      room.depth,
    );
    const floorShape = new THREE.Shape(polygon);
    const floor = new THREE.Mesh(
      new THREE.ExtrudeGeometry(floorShape, { depth: 0.08, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: materialDefaults.floor, roughness: 0.78 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.08;
    floor.receiveShadow = true;
    threeScene.add(floor);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: materialDefaults.wall, roughness: 0.92, side: THREE.DoubleSide });
    polygon.forEach((start, index) => {
      const end = polygon[(index + 1) % polygon.length];
      const dx = end.x - start.x;
      const dz = -(end.y - start.y);
      const length = Math.hypot(dx, dz);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, wallHeight), wallMaterial.clone());
      wall.position.set((start.x + end.x) / 2, wallHeight / 2, (-start.y + -end.y) / 2);
      wall.rotation.y = Math.atan2(dz, dx);
      if (index > 1) (wall.material as THREE.MeshStandardMaterial).transparent = true, (wall.material as THREE.MeshStandardMaterial).opacity = 0.18;
      threeScene.add(wall);
    });
    const grid = new THREE.GridHelper(Math.max(room.width, room.depth) * INCH, 12, "#d9d3c8", "#e7e1d8");
    grid.position.set(room.width * INCH / 2, 0.01, room.depth * INCH / 2);
    threeScene.add(grid);

    const catalogRoot = new THREE.Group();
    const cursor = { back: 3, left: 3, right: 3, front: 3 };
    const finish = resolvedCabinetFinish;
    const activeDoorTexture = resolvedThreeDDoorSampleUrl(cabinetFinish, catalogDoorSampleUrl, renderExistingDesign);
    if (renderExistingDesign) {
      for (const cabinet of placed) {
        const sku = existingCabinetSku(cabinet);
        addCabinet(catalogRoot, sku, null, cursor, room.width, room.depth, finish, materialDefaults.countertop, scene.materials?.cabinet, existingCabinetTransform(cabinet), activeDoorTexture);
      }
    } else {
      for (const suggestion of validSuggestions) {
        if (!suggestion.sku) continue;
        addCabinet(catalogRoot, suggestion.sku, suggestion.zone.wallKey, cursor, room.width, room.depth, finish, materialDefaults.countertop, scene.materials?.cabinet, undefined, activeDoorTexture);
      }
    }
    for (const opening of openings) addWallOpening(catalogRoot, opening, room.width, room.depth);
    for (const sink of sinks) addSinkFixture(catalogRoot, sink);
    threeScene.add(catalogRoot);
    catalogRootRef.current = catalogRoot;
    rendererRef.current = renderer;
    sceneRef.current = threeScene;
    cameraRef.current = camera;

    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      controls.update();
      renderer.render(threeScene, camera);
    };
    render();
    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(280, mount.clientWidth);
      const height = Math.max(280, mount.clientHeight || 420);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(mount);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      disposeObject(threeScene);
      renderer.dispose();
      renderer.domElement.remove();
      if (rendererRef.current === renderer) rendererRef.current = null;
      if (sceneRef.current === threeScene) sceneRef.current = null;
      if (cameraRef.current === camera) cameraRef.current = null;
      if (catalogRootRef.current === catalogRoot) catalogRootRef.current = null;
    };
  }, [scene, validSuggestions, placed, roomOverride, openings, sinks, renderExistingDesign, autoRotate, resetKey, resolvedCabinetFinish, countertopFinish, cabinetFinish, catalogDoorSampleUrl]);

  const downloadImage = () => {
    const renderer = rendererRef.current;
    const threeScene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !threeScene || !camera) return;
    const currentSize = new THREE.Vector2();
    renderer.getSize(currentSize);
    const currentPixelRatio = renderer.getPixelRatio();
    const { width: exportWidth, height: exportHeight } = THREE_D_EXPORT_SIZE;
    renderer.setPixelRatio(1);
    renderer.setSize(exportWidth, exportHeight, false);
    camera.aspect = exportWidth / exportHeight;
    camera.updateProjectionMatrix();
    renderer.render(threeScene, camera);
    const download = document.createElement("a");
    download.href = renderer.domElement.toDataURL("image/png");
    download.download = `cabinet-dealz-3d-room-${Date.now()}.png`;
    download.click();
    renderer.setPixelRatio(currentPixelRatio);
    renderer.setSize(currentSize.x, currentSize.y, false);
    camera.aspect = currentSize.x / currentSize.y;
    camera.updateProjectionMatrix();
  };

  const inspectCabinetAtPoint = (clientX: number, clientY: number) => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const root = catalogRootRef.current;
    if (!renderer || !camera || !root) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(root.children, true)[0];
    renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    if (!hit) return;
    let node: THREE.Object3D | null = hit.object;
    while (node && !node.userData.masterCode) node = node.parent;
    if (!node?.userData.masterCode) return;
    setSelectedCabinet({ masterCode: String(node.userData.masterCode), description: node.userData.label ?? null, distributorSkuId: typeof node.userData.distributorSkuId === "number" ? node.userData.distributorSkuId : null });
  };

  const buildQuotePdf = async () => {
    const renderer = rendererRef.current;
    if (!renderer) throw new Error("3D renderer is not ready");
    try {
      const exportRoom = roomOverride
        ? { width: roomOverride.width, depth: roomOverride.depth }
        : dimensions(scene.roomShape?.defaultDimensions);
      const planCanvas = document.createElement("canvas");
      planCanvas.width = 1000;
      planCanvas.height = 720;
      const plan = planCanvas.getContext("2d");
      if (!plan) throw new Error("Could not prepare floor plan");
      const padding = 68;
      const scale = Math.min((planCanvas.width - padding * 2) / exportRoom.width, (planCanvas.height - padding * 2) / exportRoom.depth);
      const plotWidth = exportRoom.width * scale;
      const plotHeight = exportRoom.depth * scale;
      const offsetX = (planCanvas.width - plotWidth) / 2;
      const offsetY = (planCanvas.height - plotHeight) / 2;
      plan.fillStyle = "#faf8f4";
      plan.fillRect(0, 0, planCanvas.width, planCanvas.height);
      plan.fillStyle = "#ffffff";
      plan.fillRect(offsetX, offsetY, plotWidth, plotHeight);
      plan.strokeStyle = "#26384b";
      plan.lineWidth = 10;
      plan.strokeRect(offsetX, offsetY, plotWidth, plotHeight);
      plan.fillStyle = "#4a3822";
      plan.font = "600 27px sans-serif";
      plan.fillText("Top-down 2D floor plan", 38, 42);
      const planItems = renderExistingDesign ? placed : [];
      for (const item of planItems) {
        const footprint = placedFootprint(item);
        const x = offsetX + item.x * scale;
        const y = offsetY + item.y * scale;
        const width = footprint.w * scale;
        const depth = footprint.d * scale;
        plan.fillStyle = item.placement === "appliance" ? "#d7dee4" : item.placement === "wall" ? "#d8e3ec" : item.placement === "tall" ? "#d9c3a0" : "#b88f55";
        plan.fillRect(x, y, width, depth);
        plan.strokeStyle = "#4a3822";
        plan.lineWidth = 2;
        plan.strokeRect(x, y, width, depth);
        if (width > 34 && depth > 20) {
          plan.fillStyle = "#1e2934";
          plan.font = `${Math.max(11, Math.min(18, width / 4))}px sans-serif`;
          plan.fillText(item.masterCode, x + 4, y + Math.min(depth - 4, 18));
        }
      }
      plan.fillStyle = "#526174";
      plan.font = "18px sans-serif";
      plan.fillText(`${exportRoom.width}" × ${exportRoom.depth}" room · ${planItems.length} placed item${planItems.length === 1 ? "" : "s"}`, 38, planCanvas.height - 24);
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
      pdf.setFontSize(20);
      pdf.text("Cabinet Dealz — 3D Room Quote", 40, 42);
      pdf.setFontSize(10);
      pdf.setTextColor(90);
      pdf.text(`Generated ${new Date().toLocaleString()} · Cabinet finish: ${quoteMaterials.cabinet} · Countertop: ${quoteMaterials.countertop}`, 40, 61);
      pdf.setFontSize(11);
      pdf.setTextColor(35);
      pdf.text("3D room view", 40, 78);
      pdf.addImage(renderer.domElement.toDataURL("image/png"), "PNG", 40, 88, 270, 189, undefined, "FAST");
      pdf.text("2D floor plan", 40, 300);
      pdf.addImage(planCanvas.toDataURL("image/png"), "PNG", 40, 310, 270, 194, undefined, "FAST");
      pdf.setTextColor(20);
      pdf.setFontSize(13);
      pdf.text("Itemized catalog quote", 340, 95);
      let y = 116;
      for (const line of orderLines.slice(0, 16)) {
        pdf.setFontSize(9);
        pdf.text(pdf.splitTextToSize(`${line.quantity} × ${line.label}${line.lineTotal == null ? " — Quote" : ` — $${line.lineTotal.toFixed(2)}`}`, 390), 340, y);
        y += 19;
      }
      pdf.setFontSize(14);
      pdf.text(`Catalog-priced subtotal: $${orderSummary?.subtotal.toFixed(2) ?? "0.00"}`, 340, Math.min(536, y + 12));
      pdf.setFontSize(8);
      pdf.setTextColor(90);
      pdf.text("Preview finishes are visual only. Final pricing is based on the orderable catalog selections in the design.", 40, 580);
      return pdf;
    } catch {
      toast.error("The PDF quote could not be created. Please try again.");
      return null;
    }
  };

  const exportPdf = async () => {
    const pdf = await buildQuotePdf();
    if (pdf) pdf.save(`cabinet-dealz-3d-quote-${Date.now()}.pdf`);
  };

  const printPdf = async () => {
    const pdf = await buildQuotePdf();
    if (!pdf) return;
    const printWindow = window.open(pdf.output("bloburl"), "_blank", "noopener,noreferrer");
    if (!printWindow) {
      toast.error("Your browser blocked the print window. Allow pop-ups and try again.");
      return;
    }
    window.setTimeout(() => printWindow.print(), 650);
  };

  const emailPdf = async () => {
    if (!orderSummary) {
      toast.error("Add catalog items before emailing a quote.");
      return;
    }
    const pdf = await buildQuotePdf();
    if (!pdf) return;
    try {
      const dataUri = pdf.output("datauristring") as string;
      const pdfBase64 = dataUri.slice(dataUri.indexOf(",") + 1);
      const { sentTo } = await emailQuoteMutation.mutateAsync({
        pdfBase64,
        itemCount: orderSummary.itemCount,
        subtotal: orderSummary.subtotal,
        cabinetFinish: quoteMaterials.cabinet,
        countertopFinish: quoteMaterials.countertop,
      });
      toast.success(`Quote sent to ${sentTo}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Quote email could not be sent.");
    }
  };

  const shareConfiguration = async () => {
    if (!shareContext || !roomOverride) {
      toast.error("Add your room and choose an active catalog door style before sharing.");
      return;
    }
    try {
      const { token } = await shareMutation.mutateAsync({
        ...shareContext,
        room: { ...roomOverride },
        placed,
        openings,
        sinks,
        presentation: { cabinetFinish, countertopFinish },
        orderSummary,
      });
      const url = `${window.location.origin}/3d/${token}`;
      if (navigator.share) {
        await navigator.share({ title: "Cabinet Dealz 3D Room", text: "View this Cabinet Dealz 3D room configuration.", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Share link copied to your clipboard.");
      }
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") toast.error("Could not create the share link. Please try again.");
    }
  };

  if ((!scene.roomShape && !roomOverride) || !scene.materials) {
    return <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 text-center text-sm text-muted-foreground">Choose an active distributor door style and a seeded room layout to generate a real catalog 3D preview.</div>;
  }
  if (webglUnavailable) {
    return <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 text-center text-sm text-muted-foreground">This device cannot start the interactive 3D view. Your 2D plan and elevation preview remain available.</div>;
  }

  return (
    <section ref={previewRootRef} className={`relative ${isFullscreen ? "h-screen w-screen overflow-y-auto bg-background p-3 sm:p-5" : ""} ${className ?? ""}`} aria-label="Interactive three-dimensional room preview">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Interactive 3D Preview</p>
          <p className="text-xs text-muted-foreground">{renderExistingDesign ? `${placed.length} cabinet${placed.length === 1 ? "" : "s"} from your current design` : `${scene.layout?.name} · ${validSuggestions.length} real catalog cabinet suggestion${validSuggestions.length === 1 ? "" : "s"}`}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setAutoRotate((current) => !current)}><Rotate3D className="mr-1.5 h-3.5 w-3.5" />{autoRotate ? "Pause" : "Rotate"}</Button>
          <Button type="button" size="sm" variant="outline" onClick={toggleFullscreen} title={isFullscreen ? "Exit full screen" : "View in full screen"}>{isFullscreen ? <Minimize2 className="mr-1.5 h-3.5 w-3.5" /> : <Maximize2 className="mr-1.5 h-3.5 w-3.5" />}{isFullscreen ? "Exit full screen" : "Full screen"}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setResetKey((current) => current + 1)}><Camera className="mr-1.5 h-3.5 w-3.5" />Reset</Button>
          <Button type="button" size="sm" variant="outline" onClick={downloadImage}><Download className="mr-1.5 h-3.5 w-3.5" />Download</Button>
          <Button type="button" size="sm" variant="outline" onClick={exportPdf}><FileDown className="mr-1.5 h-3.5 w-3.5" />PDF quote</Button>
          <Button type="button" size="sm" variant="outline" onClick={printPdf}><Printer className="mr-1.5 h-3.5 w-3.5" />Print</Button>
          <Button type="button" size="sm" variant="outline" onClick={emailPdf} disabled={emailQuoteMutation.isPending || !orderSummary}>{emailQuoteMutation.isPending ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />}{emailQuoteMutation.isPending ? "Sending" : "Email quote"}</Button>
          {onSaveToAccount && <Button type="button" size="sm" variant="outline" onClick={onSaveToAccount}><Save className="mr-1.5 h-3.5 w-3.5" />Save</Button>}
          <Button type="button" size="sm" onClick={shareConfiguration} disabled={!shareContext || !roomOverride || shareMutation.isPending}>{shareMutation.isPending ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Share2 className="mr-1.5 h-3.5 w-3.5" />}{shareMutation.isPending ? "Creating" : "Share"}</Button>
        </div>
      </div>
      <div className="mb-3 grid gap-3 rounded-xl border bg-muted/25 p-3 sm:grid-cols-2">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="h-3.5 w-3.5 text-[#a87f33]" />Cabinet finish preview</p>
          <div className="flex flex-wrap gap-1.5">
            {CABINET_FINISHES.map((option) => {
              const color = option.color === "catalog" ? catalogFinish : option.color;
              return <button key={option.name} type="button" onClick={() => setCabinetFinish(option.color)} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${cabinetFinish === option.color ? "border-[#a87f33] bg-[#fff7e8]" : "border-border bg-background hover:bg-muted"}`}>
                <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: color }} />{option.name}
              </button>;
            })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold">Countertop preview</p>
          <div className="flex flex-wrap gap-1.5">
            {COUNTERTOP_FINISHES.map((option) => <button key={option.name} type="button" onClick={() => setCountertopFinish(option.color)} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${countertopFinish === option.color ? "border-[#a87f33] bg-[#fff7e8]" : "border-border bg-background hover:bg-muted"}`}>
              <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: option.color }} />{option.name}
            </button>)}
          </div>
        </div>
        <p className="sm:col-span-2 text-[11px] text-muted-foreground">Preview materials change this image only. Your active catalog door style and order remain unchanged.</p>
      </div>
      {orderSummary && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9c196] bg-[#fffaf1] px-3 py-2.5">
          <div>
            <p className="text-xs font-semibold text-[#4b3a20]">Current design pricing</p>
            <p className="text-[11px] text-[#6e5d42]">{orderSummary.itemCount} item{orderSummary.itemCount === 1 ? "" : "s"} · {orderSummary.pricedLineCount} priced line{orderSummary.pricedLineCount === 1 ? "" : "s"}{orderSummary.unpricedLineCount ? ` · ${orderSummary.unpricedLineCount} awaiting price` : ""}</p>
            <p className="mt-1 text-[11px] text-[#6e5d42]">3D preview: {quoteMaterials.cabinet} cabinets · {quoteMaterials.countertop} countertop</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-[#382710]">${orderSummary.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-[#6e5d42]">Actual catalog-priced subtotal</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setPricingOpen(true)}>Itemized pricing<ChevronDown className="ml-1.5 h-3.5 w-3.5" /></Button>
          <p className="w-full text-[11px] text-[#6e5d42]">Preview finish and countertop changes do not alter this order subtotal. Choose a catalog-backed material in the 2D design to update order pricing.</p>
        </div>
      )}
      {!renderExistingDesign && catalogItems.length > 0 && (
        <div className="mb-3 rounded-xl border bg-background p-3">
          <div className="mb-2 flex items-center gap-2"><Move3D className="h-4 w-4 text-[#a87f33]" /><p className="text-xs font-semibold">Add to this 3D room</p><span className="text-[11px] text-muted-foreground">Drag an item onto the scene; it will be placed on the active wall in the editable design.</span></div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {catalogItems.map((item) => <button key={`${item.category}-${item.id}`} type="button" draggable onDragStart={(event) => { const key = `${item.category}:${item.id}`; event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("text/plain", key); setDraggedCatalogId(key); }} onDragEnd={() => setDraggedCatalogId(null)} onClick={() => onAddCatalogItem?.(item)} className="min-w-40 rounded-lg border bg-card p-2 text-left text-xs transition hover:border-[#a87f33] hover:bg-[#fffaf1]">
              <span className="block font-semibold">{item.masterCode}</span><span className="mt-0.5 block line-clamp-2 text-muted-foreground">{item.description ?? item.category}</span><span className="mt-1 block text-[10px] uppercase tracking-wide text-[#a87f33]">{item.category}</span>
            </button>)}
          </div>
        </div>
      )}
      <div className={`relative overflow-hidden rounded-xl border bg-[#f6f3ed] shadow-inner transition-opacity duration-300 touch-none ${isFullscreen ? "h-[calc(100vh-235px)] min-h-[420px]" : "h-[360px] sm:h-[440px]"} ${materialTransitioning ? "opacity-75" : "opacity-100"}`} onPointerDown={(event) => { pointerStartRef.current = { x: event.clientX, y: event.clientY }; }} onPointerMove={(event) => { if (!pointerStartRef.current) inspectCabinetAtPoint(event.clientX, event.clientY); }} onPointerUp={(event) => { const start = pointerStartRef.current; pointerStartRef.current = null; if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) inspectCabinetAtPoint(event.clientX, event.clientY); }} onDragOver={(event) => { if (draggedCatalogId != null) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const key = event.dataTransfer.getData("text/plain"); const item = catalogItems.find((candidate) => `${candidate.category}:${candidate.id}` === key); if (item) onAddCatalogItem?.(item); setDraggedCatalogId(null); }}>
        <div ref={mountRef} className="h-full w-full" />
        {materialTransitioning && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/25 backdrop-blur-[1px]"><span className="inline-flex items-center gap-2 rounded-full bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm"><LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#a87f33]" />Updating preview</span></div>}
        {selectedCabinet && (() => { const line = orderLines.find((entry) => `${entry.label} ${entry.detail ?? ""}`.toUpperCase().includes(selectedCabinet.masterCode.toUpperCase())); return <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-lg border bg-background/95 p-3 text-xs shadow-lg backdrop-blur"><div className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-[#a87f33]" /><div><p className="font-semibold">{selectedCabinet.masterCode}</p><p className="text-muted-foreground">{selectedCabinet.description ?? "Catalog cabinet"}</p><p className="mt-1">{scene.materials?.cabinet.doorStyle ?? "Catalog"} · {scene.materials?.cabinet.doorPanelType ?? "panel"}</p><p className="font-medium">{line?.lineTotal == null ? "Catalog price pending" : `Current line price: $${line.lineTotal.toFixed(2)}`}</p></div><button type="button" onClick={() => setSelectedCabinet(null)} className="text-muted-foreground hover:text-foreground">×</button></div></div>; })()}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">Click a cabinet for its price and style details · Drag to orbit or pan · Scroll or pinch to zoom · PDF quote includes this rendering and your itemized catalog lines</p>
      <Sheet open={pricingOpen} onOpenChange={setPricingOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>Itemized design pricing</SheetTitle></SheetHeader>
          <p className="mt-2 text-sm text-muted-foreground">Only catalog-priced lines are included in the subtotal. Quote-only materials remain clearly marked.</p>
          <div className="mt-5 divide-y rounded-lg border">
            {orderLines.length ? orderLines.map((line) => <div key={line.id} className="flex gap-3 p-3 text-sm"><div className="min-w-0 flex-1"><p className="font-medium">{line.label}</p>{line.detail && <p className="mt-0.5 text-xs text-muted-foreground">{line.detail}</p>}<p className="mt-1 text-xs text-muted-foreground">Qty {line.quantity}{line.unitPrice == null ? " · Price pending" : ` · $${line.unitPrice.toFixed(2)} each`}</p></div><p className="whitespace-nowrap font-semibold">{line.lineTotal == null ? "Quote" : `$${line.lineTotal.toFixed(2)}`}</p></div>) : <p className="p-4 text-sm text-muted-foreground">No orderable cabinet lines have been added yet.</p>}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-muted p-3"><span className="font-semibold">Catalog-priced subtotal</span><span className="text-lg font-semibold">${orderSummary?.subtotal.toFixed(2) ?? "0.00"}</span></div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
