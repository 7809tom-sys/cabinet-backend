import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, ChevronDown, Download, FileDown, Info, LoaderCircle, Mail, Maximize2, Minimize2, Minus, Move3D, PanelTop, Plus, Printer, RefreshCw, Rotate3D, Save, Share2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { APPLIANCES, FURNITURE_CATALOG, STD, applianceAppearanceImage, bearsCountertop, cabinetWall, cabinetWallDragPreview, cornerRotationForPlaced, elevationBox, formatEighthInches, formatInches, isBaseEndCornerCabinet, isMicrowaveOverRangePair, isWallRunDraggable, isWd18CountertopDrawerCabinet, placedCornerGeometryKind, placedFootprint, rangeVisualAppearance, wallCabinetFitMeasure, wallGapFitPreview, wallGaps, wallSpanMeasure, wd18CountertopFaceLayout, type CabinetWallDragPreview, type PlacedCabinet, type PlacedCornerGeometryKind, type PlacedFurniture, type PonyWall, type RoomData, type SinkFixture, type WallCabinetFitMeasure, type WallGapFitPreview, type WallOpening, type WallSide, type WallSpanMeasure } from "@/lib/design";
import { resolveDoorDrawerCounts, standardDoorCountForFaceWidth } from "@/lib/cabinetGraphics";
import { doorHardwareOffsetFromFaceCenterIn, FRAMED_STILE_CENTER_IN, normalizeDoorHardwareFramePosition } from "@/lib/hardware";
import { ovenOpeningGeometry } from "@/lib/ovenOpening";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type SceneSku = {
  /** Stable source ID for a cabinet that came from the authoritative 2D design. */
  placementUid?: string | null;
  distributorSkuId: number;
  cabinetId: number;
  masterCode: string;
  description: string | null;
  placementType: string | null;
  width: unknown;
  height: unknown;
  depth: unknown;
  mountBottom?: number | null;
  numberOfDoors: number | null;
  numberOfDrawers: number | null;
  doorOrientation?: "side-by-side" | "stacked" | null;
  swing?: "left" | "right" | "double" | "none" | null;
  handleSide?: "left" | "right" | null;
  hardwarePosition?: "auto" | "left" | "center" | "right" | "paired" | null;
  openingType?: string | null;
  openingWidth?: number | null;
  openingHeight?: number | null;
  doorHeight?: number | null;
  drawerHeight?: number | null;
  drawerLayout?: string | null;
  layoutSpec?: string | null;
  ovenType?: "single" | "double" | null;
  graphicType?: string | null;
  customProfile?: string | null;
  facePattern?: "slats" | "criss-cross" | "lattice" | "open" | null;
  cornerType?: string | null;
  cornerGeometryKind?: PlacedCornerGeometryKind;
  /** Original product visual selected in the 2D appliance palette. */
  catalogImageUrl?: string | null;
  decorativeEnd?: "none" | "left" | "right" | "both";
};

export type VanityFaceLayout = { drawerSide: 'left' | 'right'; drawerCount: number; drawerBankRatio: number };
export function resolvedThreeDVanityFaceLayout(layoutSpec: string | null | undefined): VanityFaceLayout | null {
  if (!layoutSpec) return null;
  try {
    const parsed = JSON.parse(layoutSpec) as { vanity?: Partial<VanityFaceLayout> };
    if (!parsed.vanity || (parsed.vanity.drawerSide !== 'left' && parsed.vanity.drawerSide !== 'right')) return null;
    return {
      drawerSide: parsed.vanity.drawerSide,
      drawerCount: Math.max(1, Math.min(8, Number(parsed.vanity.drawerCount) || 1)),
      drawerBankRatio: Math.min(0.55, Math.max(0.28, Number(parsed.vanity.drawerBankRatio) || 0.4)),
    };
  } catch {
    return null;
  }
}

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
  /** Exact saved-plan cabinet UIDs represented by this order line. */
  placementUids?: string[];
};

export function threeDOrderLineForSelectedCabinet(
  orderLines: readonly InteractiveRoomOrderLine[],
  selectedCabinet: Pick<ThreeDCabinetHit, "uid" | "masterCode">,
): InteractiveRoomOrderLine | null {
  if (selectedCabinet.uid) {
    const exactLine = orderLines.find((entry) => entry.placementUids?.includes(selectedCabinet.uid!));
    if (exactLine) return exactLine;
  }
  return orderLines.find((entry) => `${entry.label} ${entry.detail ?? ""}`.toUpperCase().includes(selectedCabinet.masterCode.toUpperCase())) ?? null;
}

export type InteractiveRoomCatalogItem = {
  id: number;
  masterCode: string;
  description: string | null;
  category: "Cabinet" | "Accessory" | "Appliance";
  catalogGroup?: ThreeDCatalogGroup;
  placement?: string | null;
  width?: number | null;
  height?: number | null;
  depth?: number | null;
};

export function threeDCatalogDragFitText(item: Pick<InteractiveRoomCatalogItem, "masterCode">, fit: WallGapFitPreview): string {
  if (fit.status === "invalid") {
    if (!fit.containsTarget) return `${item.masterCode} uses ${formatEighthInches(fit.requiredSpan)} · pointer is outside the nearest ${formatEighthInches(fit.availableSpan)} opening at ${formatEighthInches(fit.gap.start)}–${formatEighthInches(fit.gap.start + fit.gap.length)}`;
    return `${item.masterCode} uses ${formatEighthInches(fit.requiredSpan)} · opening ${formatEighthInches(fit.availableSpan)} · short ${formatEighthInches(fit.shortage)}`;
  }
  return `${item.masterCode} uses ${formatEighthInches(fit.requiredSpan)} of ${formatEighthInches(fit.availableSpan)} · snap ${formatEighthInches(fit.snapStart)}–${formatEighthInches(fit.snapEnd)} · left ${formatEighthInches(fit.before)} · right ${formatEighthInches(fit.after)}`;
}

export const THREE_D_CATALOG_GROUPS = ["All", "Base", "Corner", "Wall", "Tall", "Appliances", "Accessories"] as const;
export type ThreeDCatalogGroup = (typeof THREE_D_CATALOG_GROUPS)[number];

export function filteredThreeDCatalogItems(items: InteractiveRoomCatalogItem[], group: ThreeDCatalogGroup, search: string): InteractiveRoomCatalogItem[] {
  const query = search.trim().toLowerCase();
  return items.filter((item) => {
    const itemGroup = item.catalogGroup ?? (item.category === "Appliance" ? "Appliances" : item.category === "Accessory" ? "Accessories" : "Base");
    const groupMatches = group === "All" || itemGroup === group;
    const searchMatches = !query || `${item.masterCode} ${item.description ?? ""} ${item.category}`.toLowerCase().includes(query);
    return groupMatches && searchMatches;
  });
}

/** Core 2D-style capabilities preserved in the compact, canvas-first 3D toolbar. */
export const THREE_D_WORKSPACE_ACTIONS = ["catalog", "view", "finish", "room", "output"] as const;

/** The add-from-catalog strip remains available for both starter rooms and saved 2D plans. */
export function shouldShowThreeDCatalog(catalogItems: InteractiveRoomCatalogItem[]): boolean {
  return catalogItems.length > 0;
}

/** The manual cart sync is meaningful only when the current 3D order has cabinet lines. */
export function canSyncThreeDOrderToCart(orderLines: readonly InteractiveRoomOrderLine[]): boolean {
  return orderLines.length > 0;
}

/** Exact remaining room from the selected cabinet to its immediate neighbors or wall edges. */
export function threeDWallClearanceText(measurement: Pick<WallSpanMeasure, "before" | "after" | "beforeIsCabinet" | "afterIsCabinet"> | null): string | null {
  if (!measurement) return null;
  const beforeBoundary = measurement.beforeIsCabinet ? "previous cabinet" : "wall edge";
  const afterBoundary = measurement.afterIsCabinet ? "next cabinet" : "wall edge";
  return `Open space: ${formatInches(measurement.before)} to ${beforeBoundary} · ${formatInches(measurement.after)} to ${afterBoundary}`;
}

/** Live 3D fit text derived from the same plan coordinates used by collision validation. */
export function threeDWallFitGuideText(measurement: WallCabinetFitMeasure | null): string | null {
  if (!measurement) return null;
  const required = exactFittedFillerInches(measurement.requiredSpan);
  const available = exactFittedFillerInches(measurement.availableSpan);
  const boundaries = `${measurement.beforeBoundary} to ${measurement.afterBoundary}`;
  const snap = `${exactFittedFillerInches(measurement.snapStart)}–${exactFittedFillerInches(measurement.snapEnd)}`;
  if (!measurement.seated) {
    return `Placement guide: cabinet uses ${required} · not seated on the ${measurement.side} wall · snap to a wall to measure available space`;
  }
  if (measurement.status === "overlap") {
    const overlaps = [
      measurement.leftOverlap > 0 ? `left overlap ${exactFittedFillerInches(measurement.leftOverlap)}` : null,
      measurement.rightOverlap > 0 ? `right overlap ${exactFittedFillerInches(measurement.rightOverlap)}` : null,
    ].filter((value): value is string => value != null);
    return `Used ${required} · available opening ${available} (${boundaries}) · ${overlaps.join(" · ")} · valid snap target ${snap}`;
  }
  if (measurement.status === "insufficient") {
    return `Used ${required} · available opening ${available} (${boundaries}) · short ${exactFittedFillerInches(measurement.shortage)} · choose a smaller cabinet`;
  }
  return `Used ${required} · available opening ${available} (${boundaries}) · snap target ${snap} · left remaining ${exactFittedFillerInches(measurement.snapBefore)} · right remaining ${exactFittedFillerInches(measurement.snapAfter)} · 0\" overlap`;
}

export function exactFittedFillerInches(width: number): string {
  return formatEighthInches(width);
}

/** Automatic gap fillers retain a source-catalog description marked "cut to". */
export function threeDFittedFillerWidthText(cabinet: Pick<PlacedCabinet, "masterCode" | "description" | "category" | "subCategory" | "width">): string | null {
  const identity = `${cabinet.masterCode} ${cabinet.description ?? ""} ${cabinet.category ?? ""} ${cabinet.subCategory ?? ""}`.toLowerCase();
  const isFiller = /\bfiller\b|\bscribe\b/.test(identity);
  const isAutomaticFit = /\bcut to\b/.test(cabinet.description ?? "");
  if (!isFiller || !isAutomaticFit || !Number.isFinite(cabinet.width) || cabinet.width <= 0) return null;
  return `Filler cut: ${exactFittedFillerInches(cabinet.width)}`;
}

export type InteractiveRoomPresentation = {
  cabinetFinish: string;
  countertopFinish: string;
};

export type ThreeDCabinetMoveDirection = "up" | "down" | "left" | "right" | "in" | "out";

export type ThreeDPlanMoveDelta = { x: number; y: number };

/** Converts a screen-left/right request into the selected wall's horizontal plan axis. */
export function threeDScreenHorizontalPlanDelta(
  side: WallSide,
  direction: "left" | "right",
  incrementIn: number,
  cameraRight: Pick<THREE.Vector3, "x" | "z">,
): ThreeDPlanMoveDelta {
  const step = Math.max(0.125, Math.min(24, Number(incrementIn) || 1));
  const run = side === "top" || side === "bottom" ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const runPointsScreenRight = run.x * cameraRight.x + run.y * cameraRight.z >= 0;
  const screenRight = runPointsScreenRight ? run : { x: -run.x, y: -run.y };
  const sign = direction === "right" ? 1 : -1;
  const x = screenRight.x * step * sign;
  const y = screenRight.y * step * sign;
  return { x: Math.abs(x) < 1e-9 ? 0 : x, y: Math.abs(y) < 1e-9 ? 0 : y };
}
export type ThreeDCatalogDropTarget = { x: number; y: number; wall?: WallSide; placementUid?: string | null };
export const THREE_D_CABINET_MOVE_STEPS = [0.25, 1] as const;
export const THREE_D_EMBEDDED_TOOLBAR_CLASS = "absolute right-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap justify-end gap-1 rounded-lg border bg-background/95 p-1.5 shadow-sm backdrop-blur";
export function threeDPreviewFadeAllowed(prefersReducedMotion: boolean): boolean {
  return !prefersReducedMotion;
}
export function threeDTemporaryPreviewCounterText(counter?: { current: number; total: number }): string | null {
  return counter && counter.total > 1 ? `Suggestion ${counter.current} of ${counter.total}` : null;
}

/** Cabinet attributes stay locked until an intentional click or context-menu action picks another cabinet. */
export function threeDPointerSelectsCabinet(gesture: "move" | "up" | "context", travelPx = 0): boolean {
  return gesture === "context" || (gesture === "up" && travelPx < 6);
}

export type ThreeDRightPointerGesture = "none" | "context" | "drag";
export function threeDRightPointerGesture(button: number, travelPx: number, hasMovableCabinet: boolean): ThreeDRightPointerGesture {
  if (button !== 2 || !hasMovableCabinet) return "none";
  return travelPx >= 6 ? "drag" : "context";
}

export function threeDCabinetWallDragText(cabinet: Pick<PlacedCabinet, "masterCode">, preview: CabinetWallDragPreview): string {
  const code = cabinet.masterCode || "Cabinet";
  if (!preview.fit.containsTarget) {
    return `${code} · pointer is outside the nearest ${formatEighthInches(preview.fit.availableSpan)} opening`;
  }
  if (preview.fit.status !== "valid") {
    return `${code} uses ${formatEighthInches(preview.fit.requiredSpan)} · opening ${formatEighthInches(preview.fit.availableSpan)} · ${formatEighthInches(preview.fit.shortage)} too small`;
  }
  if (!preview.candidate) return `${code} · selected seam is blocked by another item`;
  const contact = preview.fit.before <= 1e-9 ? "touching previous edge" : "touching next edge";
  return `${code} · snap ${formatEighthInches(preview.fit.snapStart)}–${formatEighthInches(preview.fit.snapEnd)} · ${contact} · 0" gap · 0" overlap`;
}

interface Props {
  scene: InteractiveRoomScene;
  /** Current 2D design items take precedence over starter-layout suggestions. */
  placed?: PlacedCabinet[];
  roomOverride?: RoomData;
  /** Doors, cased openings, and windows from the current 2D plan. */
  openings?: WallOpening[];
  /** Countertop sink fixtures from the current 2D plan. */
  sinks?: SinkFixture[];
  /** Island zone, movable furniture, and half walls from the current 2D plan. */
  island?: { x: number; y: number; width: number; depth: number } | null;
  furniture?: PlacedFurniture[];
  ponyWalls?: PonyWall[];
  orderSummary?: InteractiveRoomOrderSummary;
  orderLines?: InteractiveRoomOrderLine[];
  initialPresentation?: InteractiveRoomPresentation;
  /** Active design-tool finish derived from the chosen catalog door style. */
  catalogFinishOverride?: string | null;
  /** Exact resolved 2D finish color for each placed cabinet, keyed by placement UID. */
  cabinetFinishOverrides?: Record<string, string>;
  /** Exact saved 2D door profile for each placed cabinet, keyed by placement UID. */
  cabinetDoorProfiles?: Record<string, { doorStyle: string | null; doorPanelType: string | null }>;
  /** Exact admin door-sample URL for each placed cabinet's effective saved style. */
  cabinetDoorSampleUrls?: Record<string, string>;
  /** Live Cabinet Config product visual for each placed cabinet, keyed by placement UID. */
  cabinetFrontVisuals?: Record<string, string>;
  /** Exact selected 2D door sample applied to 3D cabinet faces in catalog-finish mode. */
  catalogDoorSampleUrl?: string | null;
  /** Active 2D style geometry; required when a persisted saved-room scene has sparse material metadata. */
  catalogDoorProfile?: { doorStyle: string | null; doorPanelType: string | null } | null;
  /** Human-readable catalog selections used in PDF and account-email output. */
  catalogFinishName?: string | null;
  catalogCountertopName?: string | null;
  /** Exact selected 2D countertop fill used when no presentation-only override exists. */
  catalogCountertopColor?: string | null;
  shareContext?: { layoutPresetId: string; distributorId: number; styleId: number };
  catalogItems?: InteractiveRoomCatalogItem[];
  /** Reactive left-panel drag item used when browsers protect DataTransfer reads during dragover. */
  catalogDragItem?: InteractiveRoomCatalogItem | null;
  /** Active designer wall used to project explicit 3D catalog drops onto the correct wall plane. */
  catalogDropWall?: WallSide;
  onAddCatalogItem?: (item: InteractiveRoomCatalogItem, dropTarget?: ThreeDCatalogDropTarget) => void;
  /** Adds the matching hood to the editable 2D range position when one is absent. */
  onAddRangeHood?: () => void;
  onSaveToAccount?: () => void;
  /** Explicitly refreshes the main cart from the current authoritative design lines. */
  onSyncCart?: () => void;
  onPresentationChange?: (presentation: InteractiveRoomPresentation) => void;
  /** Persists an interactive wall-height adjustment back to the current 2D room. */
  onRoomWallHeightChange?: (heightIn: number) => void;
  /** Persists individual back, left, right, and front wall heights. */
  onRoomWallHeightsChange?: (heights: Record<WallSide, number>) => void;
  /** Applies a 3D attributes movement to the matching authoritative 2D placement. */
  onMoveCabinet?: (uid: string, direction: ThreeDCabinetMoveDirection, incrementIn: number, planDelta?: ThreeDPlanMoveDelta) => void;
  /** Commits an absolute same-wall cabinet position after a right-button drag preview. */
  onMoveCabinetTo?: (uid: string, x: number, y: number) => void;
  /** Host selection synchronized into the 3D action card so a second scene click is unnecessary. */
  selectedCabinetUid?: string | null;
  /** Selects the same saved placement in the host 2D designer after a 3D hit. */
  onSelectCabinet?: (uid: string) => void;
  /** Opens the selected cabinet’s standard edit controls without leaving the 3D workspace. */
  onOpenCabinetEditor?: (uid: string) => void;
  /** Uses the same 90-degree cabinet rotation action as the 2D planner. */
  onRotateCabinet?: (uid: string) => void;
  /** Removes the selected cabinet through the designer's authoritative cleanup path. */
  onRemoveCabinet?: (uid: string) => void;
  /** Keeps the primary 3D toolbar in control of wall-cabinet visibility. */
  showWallLayer?: boolean;
  onToggleWallLayer?: () => void;
  /** Non-destructive Smart Gap visual layer supplied by the designer host. */
  temporaryPreviewMessage?: string;
  onClearTemporaryPreview?: () => void;
  temporaryPreviewCounter?: { current: number; total: number };
  /** Changes whenever the host swaps a temporary preview recommendation. */
  temporaryPreviewTransitionKey?: string | null;
  /** Renders directly inside the main designer canvas rather than a standalone preview shell. */
  embedded?: boolean;
  /** Draws the complete authoritative 2D plan as a subdued floor reference beneath full-opacity 3D geometry. */
  hybridPlanUnderlay?: boolean;
  /** Exact admin-only Cabinet Config destination for a selected 3D cabinet. */
  cabinetConfigHref?: (cabinet: PlacedCabinet) => string | null;
  className?: string;
}

export type HybridPlanUnderlayModel = {
  room: { width: number; depth: number };
  cabinets: Array<{ uid: string; masterCode: string; placement: PlacedCabinet["placement"]; x: number; y: number; width: number; depth: number }>;
  openings: Array<{ uid: string; side: WallSide; offset: number; width: number; kind: WallOpening["kind"] }>;
};

/** The hybrid reference is derived from the same saved objects rendered in 3D. */
export function hybridPlanUnderlayModel(room: RoomData, placed: PlacedCabinet[], openings: WallOpening[]): HybridPlanUnderlayModel {
  return {
    room: { width: room.width, depth: room.depth },
    cabinets: placed.map((cabinet) => {
      const footprint = placedFootprint(cabinet);
      return { uid: cabinet.uid, masterCode: cabinet.masterCode, placement: cabinet.placement, x: cabinet.x, y: cabinet.y, width: footprint.w, depth: footprint.d };
    }),
    openings: openings.map((opening) => ({ uid: opening.uid, side: opening.side, offset: opening.offset, width: opening.width, kind: opening.kind })),
  };
}

function hybridPlanTexture(model: HybridPlanUnderlayModel): THREE.CanvasTexture {
  const longest = Math.max(model.room.width, model.room.depth, 1);
  const pixelsPerInch = Math.max(3, Math.min(8, 1536 / longest));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(384, Math.round(model.room.width * pixelsPerInch));
  canvas.height = Math.max(384, Math.round(model.room.depth * pixelsPerInch));
  const context = canvas.getContext("2d")!;
  const sx = canvas.width / model.room.width;
  const sy = canvas.height / model.room.depth;
  context.fillStyle = "rgba(255,255,255,0.88)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = 1;
  context.strokeStyle = "rgba(77,92,112,0.17)";
  for (let inch = 12; inch < model.room.width; inch += 12) {
    context.beginPath(); context.moveTo(inch * sx, 0); context.lineTo(inch * sx, canvas.height); context.stroke();
  }
  for (let inch = 12; inch < model.room.depth; inch += 12) {
    context.beginPath(); context.moveTo(0, inch * sy); context.lineTo(canvas.width, inch * sy); context.stroke();
  }
  for (const cabinet of model.cabinets) {
    const palette = cabinet.placement === "appliance"
      ? ["rgba(71,85,105,0.18)", "rgba(51,65,85,0.58)"]
      : cabinet.placement === "wall"
        ? ["rgba(212,167,90,0.16)", "rgba(138,101,31,0.58)"]
        : ["rgba(26,39,68,0.11)", "rgba(26,39,68,0.50)"];
    const x = cabinet.x * sx;
    const y = cabinet.y * sy;
    const width = cabinet.width * sx;
    const depth = cabinet.depth * sy;
    context.fillStyle = palette[0];
    context.strokeStyle = palette[1];
    context.lineWidth = Math.max(1, pixelsPerInch * 0.22);
    context.fillRect(x, y, width, depth);
    context.strokeRect(x, y, width, depth);
    if (width >= 34 && depth >= 16) {
      context.fillStyle = "rgba(26,39,68,0.70)";
      context.font = `600 ${Math.max(9, Math.round(pixelsPerInch * 1.25))}px system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(cabinet.masterCode, x + width / 2, y + depth / 2, Math.max(0, width - 6));
    }
  }
  context.lineCap = "square";
  for (const opening of model.openings) {
    context.lineWidth = Math.max(4, pixelsPerInch * 0.75);
    context.strokeStyle = opening.kind === "door" ? "rgba(180,83,9,0.75)" : opening.kind === "window" ? "rgba(2,132,199,0.72)" : "rgba(124,58,237,0.68)";
    context.beginPath();
    if (opening.side === "top") { context.moveTo(opening.offset * sx, 0); context.lineTo((opening.offset + opening.width) * sx, 0); }
    else if (opening.side === "bottom") { context.moveTo(opening.offset * sx, canvas.height); context.lineTo((opening.offset + opening.width) * sx, canvas.height); }
    else if (opening.side === "left") { context.moveTo(0, opening.offset * sy); context.lineTo(0, (opening.offset + opening.width) * sy); }
    else { context.moveTo(canvas.width, opening.offset * sy); context.lineTo(canvas.width, (opening.offset + opening.width) * sy); }
    context.stroke();
  }
  context.strokeStyle = "rgba(26,39,68,0.88)";
  context.lineWidth = Math.max(3, pixelsPerInch * 0.55);
  context.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
  context.fillStyle = "rgba(26,39,68,0.78)";
  context.font = `700 ${Math.max(10, Math.round(pixelsPerInch * 1.35))}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillText(`${model.room.width}\"`, canvas.width / 2, 8);
  context.save();
  context.translate(8, canvas.height / 2);
  context.rotate(-Math.PI / 2);
  context.fillText(`${model.room.depth}\"`, 0, 0);
  context.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const INCH = 1 / 12;
export const THREE_D_WALL_SIDES: WallSide[] = ["top", "left", "right", "bottom"];
const BASE_DEPTH = 24;
const WALL_DEPTH = 12;
const THREE_D_TOE_KICK = 4.5;
// A 1½-inch countertop sits directly on the 34½-inch base cabinet, so its
// center is 35¼ inches—not the 37½-inch finished-counter height. Keeping this
// as the slab center prevents a visible vertical gap above every base run.
const COUNTERTOP_H = 35.25;
const COUNTERTOP_TOP = 36;
const COUNTERTOP_FRONT_OVERHANG = 0.25 * INCH;
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

/** Keeps the selected 3D cabinet card informative even for sparse legacy records. */
export function threeDSelectedCabinetDescription(cabinet: Pick<PlacedCabinet, "masterCode"> & { description?: string | null }): string {
  const description = cabinet.description?.trim();
  if (description) return description;

  const code = cabinet.masterCode?.trim();
  return code ? `${code} cabinet` : "Catalog cabinet";
}

/** Converts the host designer selection into the data shown by the 3D action card. */
export function threeDSelectionFromPlaced(uid: string | null | undefined, placed: PlacedCabinet[]): ThreeDCabinetHit | null {
  if (!uid) return null;
  const cabinet = placed.find((item) => item.uid === uid);
  return cabinet
    ? { uid: cabinet.uid, masterCode: cabinet.masterCode, description: cabinet.description, distributorSkuId: null }
    : null;
}

/** Keeps phone-sized selected-cabinet text clear of the on-canvas movement D-pad. */
export function threeDSelectedCabinetCardClearanceClass(hasMovementDpad: boolean): string {
  return hasMovementDpad ? "pl-28 sm:pl-3" : "";
}

export type ThreeDCabinetHit = {
  uid: string | null;
  masterCode: string;
  description: string | null;
  distributorSkuId: number | null;
};

/**
 * A raycast can first hit a decorative child mesh. Continue to the placement
 * root so selected 3D cabinets always retain their saved plan identity rather
 * than losing the description and exact configuration record on a child face.
 */
export function threeDCabinetHitFromObject(object: THREE.Object3D): ThreeDCabinetHit | null {
  let node: THREE.Object3D | null = object;
  let masterCode: string | null = null;
  let uid: string | null = null;
  let description: string | null = null;
  let distributorSkuId: number | null = null;

  while (node) {
    if (!masterCode && node.userData.masterCode) masterCode = String(node.userData.masterCode);
    if (!uid && typeof node.userData.placedUid === "string") uid = node.userData.placedUid;
    if (!description && typeof node.userData.label === "string") description = node.userData.label;
    if (distributorSkuId == null && typeof node.userData.distributorSkuId === "number") {
      distributorSkuId = node.userData.distributorSkuId;
    }
    node = node.parent;
  }

  return masterCode ? { uid, masterCode, description, distributorSkuId } : null;
}

/** Select the first actual placed-cabinet hit, skipping room/countertop decoration with no placement identity. */
export function threeDCabinetHitFromIntersections(
  intersections: Array<Pick<THREE.Intersection, "object">>,
): ThreeDCabinetHit | null {
  for (const intersection of intersections) {
    const hit = threeDCabinetHitFromObject(intersection.object);
    if (hit?.uid) return hit;
  }
  return null;
}

/** Stamp exact saved-placement identity onto every visible part of a generated cabinet assembly. */
export function applyThreeDPlacementIdentity(
  object: THREE.Object3D,
  identity: Pick<ThreeDCabinetHit, "uid" | "masterCode" | "description" | "distributorSkuId">,
): void {
  object.traverse((child) => {
    child.userData = {
      ...child.userData,
      placedUid: identity.uid,
      masterCode: identity.masterCode,
      label: identity.description,
      distributorSkuId: identity.distributorSkuId,
    };
  });
}

/** Projects explicit 3D catalog drops onto the active designer wall rather than the floor. */
export function threeDCatalogDropPlane(
  wall: WallSide | undefined,
  room: Pick<RoomData, "width" | "depth">,
): THREE.Plane {
  if (wall === "left") return new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  if (wall === "right") return new THREE.Plane(new THREE.Vector3(-1, 0, 0), room.width * INCH);
  if (wall === "top") return new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  if (wall === "bottom") return new THREE.Plane(new THREE.Vector3(0, 0, -1), room.depth * INCH);
  return new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
}

/**
 * Uses the first visible saved-placement hit for a catalog drop. Projecting the
 * same screen point all the way back to the physical wall can shift the run-axis
 * coordinate in an angled camera view because cabinets and countertops stand in
 * front of that wall. The tagged placement hit preserves the position the user
 * actually pointed at; the active-wall plane remains the deterministic fallback
 * when the ray crosses only open wall/floor geometry.
 */
export function threeDCatalogDropTargetFromIntersections(
  intersections: Array<Pick<THREE.Intersection<THREE.Object3D>, "object" | "point">>,
  wallPlaneHit: THREE.Vector3,
  room: Pick<RoomData, "width" | "depth">,
  fallbackWall?: WallSide,
): ThreeDCatalogDropTarget {
  const placedIntersection = intersections.find((intersection) => Boolean(threeDCabinetHitFromObject(intersection.object)));
  const placedHit = placedIntersection ? threeDCabinetHitFromObject(placedIntersection.object) : null;
  const wallIntersection = intersections.find((intersection) => threeDRoomWallSideFromObject(intersection.object) != null);
  const point = placedIntersection?.point ?? wallPlaneHit;
  return {
    x: Math.max(0, Math.min(room.width, point.x / INCH)),
    y: Math.max(0, Math.min(room.depth, point.z / INCH)),
    wall: wallIntersection ? threeDRoomWallSideFromObject(wallIntersection.object) ?? fallbackWall : fallbackWall,
    placementUid: placedHit?.uid ?? null,
  };
}

export function threeDRoomWallSideFromObject(object: THREE.Object3D | null | undefined): WallSide | null {
  let current: THREE.Object3D | null | undefined = object;
  while (current) {
    const side = current.userData?.physicalWallSide;
    if (current.userData?.roomWall === true && (side === "top" || side === "bottom" || side === "left" || side === "right")) return side;
    current = current.parent;
  }
  return null;
}
// Drawer reveals must sit behind the physical front. Keeping this near the
// carcass face avoids line geometry projecting through painted door panels.
export const THREE_D_DRAWER_REVEAL_DEPTH = 0.002;
export const THREE_D_WALL_OPACITY = 0.72;
export const THREE_D_WALL_DEPTH_WRITE = false;

/** Keeps the orbit camera outside the furnished room envelope at every supported room size. */
export function threeDCameraDistanceLimits(maxSpan: number) {
  return {
    minDistance: Math.max(5.5, maxSpan * 0.55),
    maxDistance: Math.max(14, maxSpan * 3.4),
  };
}

/** One click makes a useful close-inspection change without skipping past the selected cabinet face. */
export const THREE_D_VIEWER_ZOOM_FACTOR = 0.76;

/** Directional pan remains proportional to the active camera distance, with a comfortable control range. */
export function threeDViewerPanStep(distance: number): number {
  return Math.max(0.35, Math.min(1.2, distance * 0.12));
}

/** Clamps button-driven zoom to the same safe OrbitControls range used for wheel and pinch input. */
export function threeDViewerZoomDistance(
  distance: number,
  limits: Pick<ReturnType<typeof threeDCameraDistanceLimits>, "minDistance" | "maxDistance">,
  direction: "in" | "out",
): number {
  const current = Math.min(limits.maxDistance, Math.max(limits.minDistance, distance));
  const requested = direction === "in" ? current * THREE_D_VIEWER_ZOOM_FACTOR : current / THREE_D_VIEWER_ZOOM_FACTOR;
  return Math.min(limits.maxDistance, Math.max(limits.minDistance, requested));
}

export type ThreeDCameraPreset = "presentation" | "front" | "wide" | "detail";

export type ThreeDCameraViewSnapshot = {
  preset: ThreeDCameraPreset;
  resetKey: number;
  position: THREE.Vector3;
  target: THREE.Vector3;
  zoom: number;
};

export type ThreeDCameraShareView = Pick<ThreeDCameraViewSnapshot, "position" | "target" | "zoom">;
export const THREE_D_CAMERA_VIEW_QUERY_PARAM = "view";

/** Encodes only transient camera state. The saved 2D plan and secure-share token are never included or altered here. */
export function serializeThreeDCameraShareView(view: ThreeDCameraShareView): string {
  const values = [view.position.x, view.position.y, view.position.z, view.target.x, view.target.y, view.target.z, view.zoom];
  if (!values.every((value) => Number.isFinite(value))) return "";
  return `1,${values.map((value) => value.toFixed(3)).join(",")}`;
}

/** Rejects malformed or extreme URL input before it reaches the Three.js camera. */
export function parseThreeDCameraShareView(value: string | null | undefined): ThreeDCameraShareView | null {
  if (!value) return null;
  const parts = value.split(",");
  if (parts.length !== 8 || parts[0] !== "1") return null;
  const values = parts.slice(1).map(Number);
  if (!values.every((entry) => Number.isFinite(entry) && Math.abs(entry) <= 1000)) return null;
  const [x, y, z, targetX, targetY, targetZ, zoom] = values;
  const position = new THREE.Vector3(x, y, z);
  const target = new THREE.Vector3(targetX, targetY, targetZ);
  if (position.distanceToSquared(target) < 0.0001 || zoom <= 0 || zoom > 4) return null;
  return { position, target, zoom };
}

/** Keeps a shared perspective within the same supported OrbitControls distance range as a local wheel or pinch gesture. */
export function constrainedThreeDCameraShareView(
  view: ThreeDCameraShareView,
  limits: Pick<ReturnType<typeof threeDCameraDistanceLimits>, "minDistance" | "maxDistance">,
): ThreeDCameraShareView {
  const offset = view.position.clone().sub(view.target);
  const distance = offset.length();
  const clampedDistance = Math.max(limits.minDistance, Math.min(limits.maxDistance, distance));
  return {
    position: view.target.clone().add(offset.normalize().multiplyScalar(clampedDistance)),
    target: view.target.clone(),
    zoom: Math.max(0.5, Math.min(2, view.zoom)),
  };
}

/** Scene rebuilds preserve the user's view; explicit camera resets and preset changes do not. */
export function threeDShouldRestoreCameraView(
  snapshot: Pick<ThreeDCameraViewSnapshot, "preset" | "resetKey"> | null | undefined,
  preset: ThreeDCameraPreset,
  resetKey: number,
): boolean {
  return Boolean(snapshot && snapshot.preset === preset && snapshot.resetKey === resetKey);
}

/** Stable framing presets keep 3D reviews clear without changing the active 2D design. */
export function threeDCameraPresetPosition(preset: ThreeDCameraPreset, maxSpan: number) {
  switch (preset) {
    case "front": return new THREE.Vector3(maxSpan * 0.5, maxSpan * 0.72, maxSpan * 1.8);
    case "wide": return new THREE.Vector3(maxSpan * 1.5, maxSpan * 1.22, maxSpan * 1.58);
    case "detail": return new THREE.Vector3(maxSpan * 0.98, maxSpan * 0.66, maxSpan * 0.96);
    default: return new THREE.Vector3(maxSpan * 1.15, maxSpan * 0.92, maxSpan * 1.25);
  }
}

export function threeDDoorMaterialFallback(color: string) {
  return { color, map: null as null };
}

/** A provided sample map carries the exact finish; tinting would darken or alter it. */
export function threeDFaceMaterialColor(color: string, hasProvidedDoorSample: boolean) {
  return hasProvidedDoorSample ? "#ffffff" : color;
}

/** Every structural cabinet surface follows the chosen finish; a supplied door sample supplies both its detail and hue. */
export function threeDStructuralFinish(color: string, hasProvidedDoorSample: boolean) {
  return {
    color,
    usesDoorSample: false,
  };
}

/** Decorative end panels are opt-in; normal cabinet ends are plain finished skins. */
export function threeDDecorativeEndSides(treatment: SceneSku["decorativeEnd"] | undefined): Array<-1 | 1> {
  if (treatment === "left") return [-1];
  if (treatment === "right") return [1];
  return treatment === "both" ? [-1, 1] : [];
}

function threeDDoorTextureAverageColor(texture: THREE.Texture | null, fallback: string) {
  if (!texture?.image || typeof document === "undefined") return fallback;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallback;
    context.drawImage(texture.image as CanvasImageSource, 0, 0, 1, 1);
    const pixels = context.getImageData(0, 0, 1, 1).data;
    const red = pixels[0];
    const green = pixels[1];
    const blue = pixels[2];
    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return fallback;
  }
}

export function shouldRenderCountertopOverSceneItem(
  placementOrItem: string | Pick<PlacedCabinet, "placement" | "masterCode" | "description" | "subCategory">,
  masterCode = "",
  description: string | null = null,
) {
  const item = typeof placementOrItem === "string"
    ? { placement: placementOrItem as PlacedCabinet["placement"], masterCode, description }
    : placementOrItem;
  // Keep 3D counter coverage identical to ElevationView: a counter sits over a
  // genuine counter-bearing base, plus a dishwasher or wine opening. Master
  // code is deliberately considered even on stale placements, so an appliance
  // accidentally persisted as "base" can never receive a false counter slab.
  if (/^(?:DW|DISHWASHER|WINE)[-_]?\d/i.test(item.masterCode ?? "")) return true;
  if (/^(?:RANGE|FRIDGE|HOOD|MW|MICROWAVE|OVEN)[-_]?\d/i.test(item.masterCode ?? "")) return false;
  return bearsCountertop(item);
}

/** A standard 24-inch base run receives a precise quarter-inch front countertop overhang. */
export function threeDCountertopDepthIn(cabinetDepthIn: number) {
  return cabinetDepthIn + 0.25;
}

export function rangeOvenFrontLayout(bodyHeight: number) {
  const drawerHeight = Math.max(0.12, bodyHeight * 0.14);
  const openingHeight = Math.max(0.2, bodyHeight * 0.54);
  return {
    openingHeight,
    openingCenterY: drawerHeight * 0.42,
    drawerHeight,
    drawerCenterY: -bodyHeight / 2 + drawerHeight / 2 + 0.04,
  };
}

/** The upper bridge grows with the total 84/90/96-inch single-oven tower. */
export function singleOvenTowerAssembly(totalHeightIn: number) {
  const baseHeightIn = 34.5;
  const ovenHeightIn = 27;
  const fillerHeightIn = 3;
  return {
    baseHeightIn,
    ovenHeightIn,
    fillerHeightIn,
    bridgeHeightIn: Math.max(0, totalHeightIn - baseHeightIn - ovenHeightIn - fillerHeightIn),
  };
}

export function rangeCooktopLayout(bodyWidth: number, bodyDepth: number, bodyHeight: number, mountBottomIn = 0, controlPosition: "front" | "rear" = "rear") {
  // A front-control range has one continuous, full-depth cooking surface. Rear
  // control ranges reserve a slightly larger perimeter for their backguard.
  const perimeterInset = controlPosition === "front" ? 0.04 : 0.12;
  const cooktopWidth = Math.max(0.2, bodyWidth - perimeterInset);
  const cooktopDepth = Math.max(0.2, bodyDepth - perimeterInset);
  const cooktopThickness = 0.045;
  const burnerRadius = Math.max(0.06, Math.min(cooktopWidth, cooktopDepth) * 0.105);
  const xOffset = cooktopWidth * 0.24;
  const zOffset = cooktopDepth * 0.23;
  // A freestanding range's cooktop follows the 34½-inch base-cabinet line. The
  // countertop slab may sit above this line, but only the rear range controls
  // rise higher than the adjacent cabinet faces.
  const cookingSurfaceY = (STD.RANGE_COOKING_SURFACE_HEIGHT - mountBottomIn) * INCH - bodyHeight / 2;
  return {
    cooktopWidth,
    cooktopDepth,
    cooktopThickness,
    topY: cookingSurfaceY - cooktopThickness / 2,
    cookingSurfaceY,
    controlPosition,
    flatFrontControlTop: controlPosition === "front",
    burnerRadius,
    burnerCenters: [
      { x: -xOffset, z: -zOffset },
      { x: xOffset, z: -zOffset },
      { x: -xOffset, z: zOffset },
      { x: xOffset, z: zOffset },
    ],
  };
}

/** Shared freestanding-range vertical profile, measured from finished floor. */
export function freestandingRangeHeightProfile(mountBottomIn = 0, bodyHeight = 0) {
  const cookingSurfaceIn = STD.RANGE_COOKING_SURFACE_HEIGHT;
  const backguardTopIn = STD.RANGE_BACKGUARD_TOP;
  const backguardHeight = Math.max(0, (backguardTopIn - cookingSurfaceIn) * INCH);
  const cookingSurfaceY = (cookingSurfaceIn - mountBottomIn) * INCH - bodyHeight / 2;
  const backguardTopY = (backguardTopIn - mountBottomIn) * INCH - bodyHeight / 2;
  return { cookingSurfaceIn, backguardTopIn, backguardHeight, cookingSurfaceY, backguardTopY };
}

/** The 3D selling preview uses original product imagery only on catalog-backed appliance fronts. */
export function threeDApplianceFrontVisualUrl(sku: Pick<SceneSku, "masterCode" | "catalogImageUrl">): string | null {
  if (!/^(?:RANGE|HOOD|FRIDGE|DW|MW)[-_]?/i.test(sku.masterCode ?? "")) return null;
  return applianceAppearanceImage(sku.masterCode, sku.catalogImageUrl ?? null);
}

/** A supplied Cabinet Config product visual is authoritative for a cabinet front. */
export function threeDCabinetFrontVisualUrl(sku: Pick<SceneSku, "placementType" | "catalogImageUrl">): string | null {
  if ((sku.placementType ?? "").toLowerCase() === "appliance") return null;
  return sku.catalogImageUrl?.trim() || null;
}

/** A supplied full-door sample already contains its real rail/stile profile. */
export function threeDUsesPhysicalShakerRails(profileKind: string, hasSuppliedDoorSample: boolean): boolean {
  if (profileKind !== "shaker") return false;
  // A supplied full-door sample already contains its real rail/stile profile
  // visually. Physical rails would double the detail and create artifacts.
  if (hasSuppliedDoorSample) return false;
  return true;
}

export function threeDVisibleMaterialMode(doorSampleUrl: string | null | undefined, textureState: "not-requested" | "loading" | "loaded" | "failed") {
  if (doorSampleUrl && textureState === "loaded") return "selected-texture" as const;
  if (doorSampleUrl && textureState === "loading") return "selected-texture-loading" as const;
  return "calibrated-fallback" as const;
}

/**
 * A selected door sample is authoritative Cabinet Config information when the
 * style does not supply an explicit finish color. Apply that supplied material
 * to the actual door and drawer panels only; never substitute a generic color.
 */
export function threeDUsesDoorSampleTexture(doorSampleUrl?: string | null) {
  return Boolean(doorSampleUrl);
}

/** Exact supplied samples must not be altered by scene lighting or generic tinting. */
export function threeDUsesExactDoorSampleMaterial(hasProvidedDoorSample: boolean) {
  return hasProvidedDoorSample;
}

export function threeDMaterialStatusText(mode: ReturnType<typeof threeDVisibleMaterialMode>, textureState: "not-requested" | "loading" | "loaded" | "failed") {
  const textureLabel = textureState === "not-requested" ? "not selected" : textureState;
  return `Cabinet material: ${mode.replaceAll("-", " ")} · Door sample texture: ${textureLabel}`;
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isEqualHeightTwoDrawerBase(
  sku: Pick<SceneSku, "drawerLayout"> & Partial<Pick<SceneSku, "masterCode" | "numberOfDoors" | "numberOfDrawers">>,
  fallbackCount: number,
) {
  const code = String(sku.masterCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const drawerCount = Math.max(0, Number(sku.numberOfDrawers) || fallbackCount);
  // The 2-DB code is authoritative. Some supplier or legacy rows incorrectly
  // carry a positive door count even though the product is a two-drawer base.
  return /^2DB\d/.test(code) && drawerCount === 2;
}

export function resolvedThreeDDrawerRows(
  sku: Pick<SceneSku, "drawerLayout"> & Partial<Pick<SceneSku, "masterCode" | "numberOfDoors" | "numberOfDrawers">>,
  availableHeight: number,
  fallbackCount: number,
  useShallowTopDrawer = false,
) {
  const count = Math.max(0, fallbackCount);
  if (isEqualHeightTwoDrawerBase(sku, fallbackCount)) {
    return Array.from({ length: 2 }, () => ({ count: 1, height: availableHeight / 2 }));
  }
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
  if (useShallowTopDrawer && count > 1 && availableHeight > 6 * INCH) {
    const topHeight = 6 * INCH;
    const remainingHeight = (availableHeight - topHeight) / (count - 1);
    return [{ count: 1, height: topHeight }, ...Array.from({ length: count - 1 }, () => ({ count: 1, height: remainingHeight }))];
  }
  return count ? Array.from({ length: count }, () => ({ count: 1, height: availableHeight / count })) : [];
}

export function threeDDrawerZoneHeight(input: {
  availableHeight: number;
  drawerCount: number;
  doorCount: number;
  configuredDrawerHeight?: number | null;
  hasConfiguredOpening: boolean;
  placement: string;
}) {
  if (!input.drawerCount) return 0;
  if (input.configuredDrawerHeight && input.configuredDrawerHeight > 0) {
    return Math.min(input.availableHeight, input.configuredDrawerHeight);
  }
  // Standard base cabinets with both drawers and doors use a shallow, six-inch
  // utility drawer by default. This matches the supplied Honey Shaker reference
  // and leaves the larger lower opening for the doors.
  if (input.placement === "base" && input.doorCount > 0) {
    return Math.min(input.availableHeight, 6 * INCH);
  }
  return input.doorCount === 0 && !input.hasConfiguredOpening
    ? input.availableHeight
    : input.availableHeight * 0.35;
}

export function threeDTallPantryDoorsPerRow(input: Pick<SceneSku, "numberOfDoors" | "width" | "doorOrientation">) {
  const configuredDoorCount = Math.max(0, Math.round(Number(input.numberOfDoors) || 0));
  if (configuredDoorCount === 2 && input.doorOrientation === "stacked") return 1;
  if (configuredDoorCount === 2) return 1;
  if (configuredDoorCount >= 4) return 2;
  // Older placements without door metadata follow the standard narrow pantry
  // convention: an 18-inch pantry has one upper and one lower door.
  return numberValue(input.width, 18) <= 18.5 ? 1 : 2;
}

export function threeDHasVerifiedDoorLayout(input: Pick<SceneSku, "numberOfDoors" | "numberOfDrawers" | "doorOrientation" | "drawerLayout" | "layoutSpec">) {
  return (Number(input.numberOfDoors) || 0) > 0
    || (Number(input.numberOfDrawers) || 0) > 0
    || Boolean(input.doorOrientation)
    || Boolean(input.drawerLayout)
    || Boolean(input.layoutSpec);
}

export function threeDUsesCatalogFrontVisual(input: {
  hasCatalogFrontVisual: boolean;
  hasDoorSample: boolean;
  hasDoorTexture: boolean;
  specialtyKind: string;
  isRefrigeratorEndPanel: boolean;
  hasVerifiedDoorLayout: boolean;
}) {
  return input.hasCatalogFrontVisual
    && !input.hasDoorSample
    && !input.hasDoorTexture
    && input.specialtyKind === "standard"
    && !input.isRefrigeratorEndPanel
    && !input.hasVerifiedDoorLayout;
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
  // A single oven tower has a fixed two-door upper bridge. Older saved records
  // can carry `numberOfDoors: 0` even though the visible 2D assembly includes
  // the bridge, so normalize that stale metadata before building the 3D face.
  const enforcedDoorCount = input.ovenType === "single" ? 2 : null;
  const doorCount = enforcedDoorCount ?? (input.numberOfDoors != null && input.numberOfDoors > 0
    ? input.numberOfDoors
    : described.doorCount ?? (input.numberOfDoors === 0 ? 0 : 2));
  // The existing 2D oven cabinet contract is authoritative: a single oven
  // carries three bottom drawers, while a double oven carries one. Explicit
  // saved `ovenType` therefore corrects stale catalog drawer counts instead of
  // letting an old supplier row change the visible enclosure in 3D.
  const enforcedDrawerCount = input.ovenType === "single" ? 3 : input.ovenType === "double" ? 1 : null;
  const drawerCount = enforcedDrawerCount ?? (
    input.numberOfDrawers != null && input.numberOfDrawers > 0
      ? input.numberOfDrawers
      : described.drawerCount ?? (input.numberOfDrawers === 0 ? 0 : ovenCount === 2 ? 1 : 3)
  );
  const requestedDrawerHeight = input.drawerHeight != null
    ? Math.max(0, Number(input.drawerHeight) * INCH)
    : enforcedDrawerCount != null ? drawerCount * 11 * INCH : drawerCount * 5 * INCH;
  const requestedRows = enforcedDrawerCount != null
    ? Array.from({ length: drawerCount }, () => ({ count: 1, height: 11 * INCH }))
    : resolvedThreeDDrawerRows({ drawerLayout: input.drawerLayout ?? null }, requestedDrawerHeight, drawerCount);
  const measuredOpeningHeight = described.openingHeight != null ? described.openingHeight * INCH : null;
  let doorZone = doorCount
    ? input.doorHeight != null
      ? Math.min(usableHeight * 0.7, Math.max(0, Number(input.doorHeight) * INCH))
      : measuredOpeningHeight != null
        ? Math.max(0, usableHeight - measuredOpeningHeight - requestedRows.reduce((sum, row) => sum + row.height, 0))
        : usableHeight * 0.2
    : 0;
  const fixedSingleOvenOpening = input.ovenType === "single" ? 27 * INCH : null;
  if (input.ovenType === "single" && doorCount) {
    doorZone = singleOvenTowerAssembly(numberValue(input.height, 84)).bridgeHeightIn * INCH;
  }
  const requestedDrawerZone = requestedRows.reduce((sum, row) => sum + row.height, 0);
  const availableDrawerZone = Math.max(0, usableHeight - doorZone - (fixedSingleOvenOpening ?? measuredOpeningHeight ?? usableHeight * 0.15));
  const drawerScale = requestedDrawerZone > availableDrawerZone && requestedDrawerZone > 0 ? availableDrawerZone / requestedDrawerZone : 1;
  const drawerRows = requestedRows.map((row) => ({ ...row, height: row.height * drawerScale }));
  const drawerZone = drawerRows.reduce((sum, row) => sum + row.height, 0);
  return {
    usableHeight,
    doorCount,
    doorZone,
    drawerRows,
    drawerZone,
    openingHeight: fixedSingleOvenOpening ?? Math.max(0.12, usableHeight - doorZone - drawerZone),
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

/** Matches the 2D Corner Drawer Base face: an 8% corner marker plus a 92% full-height drawer stack. */
export function cornerDrawerFrontLayout(bodyWidth: number) {
  const cornerMarkerWidth = Math.max(0.04, bodyWidth * 0.08);
  return {
    cornerMarkerWidth,
    drawerStackWidth: Math.max(0.08, bodyWidth - cornerMarkerWidth),
  };
}

/**
 * The physical L-corner footprint shared by the 2D plan and 3D CDB36 carcass.
 * With a 36-inch bounding square, the 24-inch legs leave a 12-inch interior notch.
 */
export function lCornerCarcassParts(bodyWidth: number, bodyDepth: number, legRatio = 2 / 3) {
  const boundedLegRatio = Math.max(0.3, Math.min(0.95, legRatio));
  const legWidth = bodyWidth * boundedLegRatio;
  const legDepth = bodyDepth * boundedLegRatio;
  return {
    legWidth,
    legDepth,
    backLeg: { width: bodyWidth, depth: legDepth, x: 0, z: -(bodyDepth - legDepth) / 2 },
    sideLeg: { width: legWidth, depth: bodyDepth - legDepth, x: -(bodyWidth - legWidth) / 2, z: (legDepth) / 2 },
  };
}

/**
 * Plan-space vertices for a true diagonal-corner cabinet. The saved 2D plan
 * stores the enclosing square, but the cabinet occupies the wall-side triangle
 * behind its 45-degree face rather than a full rectangular box.
 */
export function diagonalCornerFootprintVertices(bodyWidth: number, bodyDepth: number, legRatio = 0.5) {
  const cutX = -bodyWidth / 2 + bodyWidth * legRatio;
  const cutZ = -bodyDepth / 2 + bodyDepth * legRatio;
  return [
    { x: -bodyWidth / 2, z: -bodyDepth / 2 },
    { x: bodyWidth / 2, z: -bodyDepth / 2 },
    { x: bodyWidth / 2, z: cutZ },
    { x: cutX, z: bodyDepth / 2 },
    { x: -bodyWidth / 2, z: bodyDepth / 2 },
  ];
}

/**
 * A WDC's diagonal is the hypotenuse of its two 12-inch returns within the
 * 24-by-24 footprint: √(12² + 12²) ≈ 17 inches. This is the total two-door
 * front, not the diagonal across the full enclosing square.
 */
export function diagonalCornerFrontWidth(bodyWidth: number, bodyDepth: number) {
  return Math.hypot(bodyWidth / 2, bodyDepth / 2);
}

/** The full diagonal of a right-triangle corner is its actual angled front. */
export function triangleCornerFrontWidth(bodyWidth: number, bodyDepth: number) {
  return Math.hypot(bodyWidth, bodyDepth);
}

/** The exposed hypotenuse plane of a triangular angled-wall cabinet. */
export function triangleCornerFrontPose(bodyWidth: number, bodyDepth: number, outwardOffset = 0.029) {
  const normalX = -Math.SQRT1_2;
  const normalZ = Math.SQRT1_2;
  void bodyWidth;
  void bodyDepth;
  return {
    x: normalX * outwardOffset,
    z: normalZ * outwardOffset,
    rotation: -Math.PI / 4,
    normalX,
    normalZ,
  };
}

/** The local triangle assumes the wall corner is back-left; shared rotation orients it elsewhere. */
export function triangleCornerFootprintVertices(bodyWidth: number, bodyDepth: number) {
  return [
    { x: -bodyWidth / 2, z: -bodyDepth / 2 },
    { x: bodyWidth / 2, z: -bodyDepth / 2 },
    { x: bodyWidth / 2, z: bodyDepth / 2 },
  ];
}

/** Builds the vertical pentagonal extrusion defined by the shared 2D diagonal footprint. */
function diagonalCornerWedgeGeometry(bodyWidth: number, bodyDepth: number, height: number) {
  const vertices = diagonalCornerFootprintVertices(bodyWidth, bodyDepth);
  const shape = new THREE.Shape();
  shape.moveTo(vertices[0]!.x, -vertices[0]!.z);
  for (const vertex of vertices.slice(1)) shape.lineTo(vertex.x, -vertex.z);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -height / 2, 0);
  return geometry;
}

/**
 * BEC-24 follows its Cabinet Config diagram: two 24-inch cabinet sides run
 * from one rear apex to the two front ends, and its door faces meet at the
 * shared exterior apex. Its plan is therefore a diamond, not a 24×24 box.
 */
export function baseEndAttachedFrontLayout(bodyWidth: number, bodyDepth: number) {
  const sideLength = Math.min(bodyWidth, bodyDepth);
  // The diagram shows two short fronts at the exterior apex. The 24-inch
  // dimensions label the two rear construction sides, never the door spans.
  const doorWidth = Math.min(sideLength, 8.45 * INCH);
  const doorFaceOffset = 0.029;
  const halfDiagonal = sideLength / Math.SQRT2;
  const rearApex = { x: 0, z: -halfDiagonal };
  const apex = { x: 0, z: halfDiagonal };
  return {
    apex,
    rearApex,
    sideLength,
    doorWidth,
    footprint: [rearApex, { x: -halfDiagonal, z: 0 }, apex, { x: halfDiagonal, z: 0 }],
    faces: [
      { side: "left" as const, x: -doorWidth * Math.SQRT1_2 / 2 - doorFaceOffset * Math.SQRT1_2, z: halfDiagonal - doorWidth * Math.SQRT1_2 / 2 + doorFaceOffset * Math.SQRT1_2, rotation: -Math.PI / 4 },
      { side: "right" as const, x: doorWidth * Math.SQRT1_2 / 2 + doorFaceOffset * Math.SQRT1_2, z: halfDiagonal - doorWidth * Math.SQRT1_2 / 2 + doorFaceOffset * Math.SQRT1_2, rotation: Math.PI / 4 },
    ],
    supportFaces: [
      { side: "left" as const, x: -halfDiagonal / 2, z: halfDiagonal / 2, rotation: -Math.PI / 4 },
      { side: "right" as const, x: halfDiagonal / 2, z: halfDiagonal / 2, rotation: Math.PI / 4 },
    ],
  };
}

/** Extrudes BEC's diagram-defined diamond plan into a vertical cabinet body or top support. */
function baseEndDiagramGeometry(sideLength: number, height: number) {
  const layout = baseEndAttachedFrontLayout(sideLength, sideLength);
  const shape = new THREE.Shape();
  const [first, ...rest] = layout.footprint;
  shape.moveTo(first!.x, -first!.z);
  for (const point of rest) shape.lineTo(point.x, -point.z);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -height / 2, 0);
  return geometry;
}

/** Builds the vertical triangular extrusion defined by the shared 2D triangle footprint. */
function triangleCornerWedgeGeometry(bodyWidth: number, bodyDepth: number, height: number) {
  const vertices = triangleCornerFootprintVertices(bodyWidth, bodyDepth);
  const shape = new THREE.Shape();
  shape.moveTo(vertices[0]!.x, -vertices[0]!.z);
  for (const vertex of vertices.slice(1)) shape.lineTo(vertex.x, -vertex.z);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -height / 2, 0);
  return geometry;
}

export function dimensions(value: unknown) {
  const object = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    width: numberValue(object.width, 144),
    depth: numberValue(object.depth, 120),
    ceilingHeight: numberValue(object.ceilingHeight, 96),
  };
}

/** Wall context can be hidden down to one inch or shown up to a ten-foot room. */
export function constrainedThreeDWallHeight(value: unknown, fallback = 96) {
  const parsed = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(120, Math.max(1, Math.round(safe)));
}

export function sceneCabinetColor(scene: InteractiveRoomScene) {
  const color = scene.materials?.cabinet.color?.trim() ?? "";
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const source = `${scene.materials?.cabinet.finish ?? ""} ${color}`.toLowerCase();
  // Calibrated from the verified Preston Aero Sage door, drawer, full-door,
  // and room-scene references supplied by the catalog owner. This specific
  // finish intentionally takes precedence over the broad generic sage fallback.
  if (/(aero sage|aston green)/.test(source)) return "#4f5549";
  if (/(black|charcoal|obsidian|graphite)/.test(source)) return "#34363a";
  if (/(navy|blue|ocean)/.test(source)) return "#435b77";
  if (/(green|sage|forest)/.test(source)) return "#78826b";
  if (/(walnut|espresso|brown|mocha)/.test(source)) return "#75523e";
  // Calibrated from the owner-supplied Designer Natural door, drawer, full-door,
  // and installed-room references: a light creamy maple/oak rather than the
  // former orange-brown generic wood fallback.
  if (/(oak|maple|honey|natural)/.test(source)) return "#d1ba8f";
  if (/(cream|beige|linen|almond)/.test(source)) return "#ded5c1";
  return "#f2f0ea";
}

export function resolvedCatalogFinish(scene: InteractiveRoomScene, catalogFinishOverride?: string | null) {
  const override = catalogFinishOverride?.trim() ?? "";
  return /^#[0-9a-f]{6}$/i.test(override) ? override : sceneCabinetColor(scene);
}

/** Resolves one 3D cabinet's exact saved 2D finish before using the design default. */
export function resolvedPlacedCabinetFinish(
  cabinet: Pick<PlacedCabinet, "uid">,
  cabinetFinishOverrides: Record<string, string> | undefined,
  designDefault: string,
) {
  return cabinetFinishOverrides?.[cabinet.uid] ?? designDefault;
}

/** Resolves a placed cabinet's own saved 2D feature style before the plan default. */
export function resolvedPlacedCabinetDoorProfile(
  cabinet: Pick<PlacedCabinet, "uid">,
  cabinetDoorProfiles: Record<string, { doorStyle: string | null; doorPanelType: string | null }> | undefined,
  planDefault: { doorStyle: string | null; doorPanelType: string | null } | null | undefined,
) {
  const placedProfile = cabinetDoorProfiles?.[cabinet.uid];
  const placedIdentity = `${placedProfile?.doorStyle ?? ""} ${placedProfile?.doorPanelType ?? ""}`.trim();
  return placedIdentity ? placedProfile : planDefault ?? null;
}

/** Resolves a live Cabinet Config product visual when older saved placements omitted it. */
export function resolvedPlacedCabinetFrontVisual(
  cabinet: Pick<PlacedCabinet, "uid">,
  cabinetFrontVisuals: Record<string, string> | undefined,
  fallback: string | null | undefined,
) {
  return cabinetFrontVisuals?.[cabinet.uid] ?? fallback ?? null;
}

/** Resolves a placed cabinet's saved admin door sample before the design default sample. */
export function resolvedPlacedCabinetDoorSampleUrl(
  cabinet: Pick<PlacedCabinet, "uid">,
  cabinetDoorSampleUrls: Record<string, string> | undefined,
  catalogDoorSampleUrl?: string | null,
  preferSelectedPlanSample = false,
) {
  return resolvedThreeDDoorSampleUrl(
    "catalog",
    cabinetDoorSampleUrls?.[cabinet.uid] ?? catalogDoorSampleUrl,
    preferSelectedPlanSample,
  );
}

export function resolvedThreeDDoorSampleUrl(cabinetFinish: string, catalogDoorSampleUrl?: string | null, preferSelectedPlanSample = false) {
  const sample = catalogDoorSampleUrl?.trim() ?? "";
  return (preferSelectedPlanSample || cabinetFinish === "catalog") && sample ? sample : null;
}

export function resolvedThreeDDoorProfile(
  scene: InteractiveRoomScene,
  catalogDoorProfile?: { doorStyle: string | null; doorPanelType: string | null } | null,
) {
  const selectedProfile = `${catalogDoorProfile?.doorStyle ?? ""} ${catalogDoorProfile?.doorPanelType ?? ""}`.trim();
  return selectedProfile ? catalogDoorProfile : scene.materials?.cabinet ?? null;
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

/** The physical Shaker frame must share the exact pose of its door face. */
export function threeDShakerFramePose(x: number, y: number, z: number, rotationY = 0) {
  return { x, y, z, rotationY };
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

/**
 * The currently edited 2D room is authoritative. A normal 2D room has no
 * polygon vertices and must stay rectangular rather than inheriting an older
 * L-shaped starter-layout template.
 */
export function activeThreeDRoomGeometry(
  roomOverride: RoomData | undefined,
  sceneRoomShape: InteractiveRoomScene["roomShape"] | undefined,
) {
  if (roomOverride) {
    return roomOverride.vertices?.length ? { vertices: roomOverride.vertices } : null;
  }
  return sceneRoomShape?.geometryTemplate ?? null;
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
  masterCode?: string | null;
  placementType?: string | null;
  width?: unknown;
  description?: string | null;
  numberOfDoors?: number | null;
  numberOfDrawers?: number | null;
  openingType?: string | null;
  graphicType?: string | null;
  customProfile?: string | null;
  cornerType?: string | null;
  facePattern?: "slats" | "criss-cross" | "lattice" | "open" | null;
  drawerLayout?: string | null;
  doorHeight?: number | null;
  drawerHeight?: number | null;
}) {
  const hasProvidedFaceDescription = /\b(?:door|drawer|opening)\b/i.test(input.description ?? "");
  const isExactStandardBase = /^B[-_]?\d{1,2}$/i.test(input.masterCode ?? "");
  const descriptionFaceCounts = resolveDoorDrawerCounts({
    masterCode: input.masterCode ?? undefined,
    description: input.description ?? null,
    placementType: input.placementType ?? null,
    width: typeof input.width === "number" || typeof input.width === "string" ? input.width : null,
    numberOfDoors: input.numberOfDoors ?? null,
    numberOfDrawers: input.numberOfDrawers ?? null,
    openingType: input.openingType ?? null,
    graphicType: input.graphicType ?? input.customProfile ?? null,
    cornerType: input.cornerType ?? null,
    facePattern: input.facePattern ?? null,
    drawerLayout: input.drawerLayout ?? null,
    doorHeight: input.doorHeight ?? null,
    drawerHeight: input.drawerHeight ?? null,
  });
  // A description that names doors, drawers, or openings is authoritative.
  // A generic label such as "Base Cabinet" has no face facts, so retain its
  // explicit Cabinet Config counts instead of discarding them. When neither
  // source specifies a count, use the shared 21-inch standard-face rule.
  const configuredFaceCounts = isExactStandardBase
    ? descriptionFaceCounts
    : hasProvidedFaceDescription
    ? descriptionFaceCounts
    : {
      doors: input.numberOfDoors == null
        ? standardDoorCountForFaceWidth(typeof input.width === "number" || typeof input.width === "string" ? input.width : null)
        : Math.max(0, input.numberOfDoors),
      drawers: Math.max(0, input.numberOfDrawers ?? 0),
    };
  if (isWd18CountertopDrawerCabinet({ masterCode: input.masterCode, placement: input.placementType })) {
    return { hasConfiguredOpening: false, doorCount: 1, drawerCount: 2 };
  }
  return {
    hasConfiguredOpening: Boolean(input.openingType && input.openingType !== "none"),
    doorCount: configuredFaceCounts.doors,
    drawerCount: configuredFaceCounts.drawers,
  };
}

export function resolvedThreeDSpecialtyProfile(sku: Pick<SceneSku, "graphicType" | "customProfile" | "facePattern" | "cornerType" | "cornerGeometryKind" | "masterCode" | "description">) {
  const graphic = `${sku.graphicType ?? ""} ${sku.customProfile ?? ""}`.toLowerCase();
  if (/^(?:ada[-_])?fsb[-_]?\d/i.test(sku.masterCode) || /farm(?:house)?\s+sink|apron[-\s]?front/i.test(sku.description ?? "")) return { kind: "farmhouse-sink" as const, pattern: null };
  // AW1230, AW1236, and AW1242 are one angled-wall family. Catalog rows do
  // not consistently store diagonal corner metadata, so code/description must
  // route each one through the true triangular hypotenuse branch first.
  if (isAngledWallProfile(sku)) return { kind: "diagonal-corner" as const, pattern: null };
  if (/corner-drawer-base/.test(graphic) || /^cdb[-_]?\d/.test(sku.masterCode) || /corner drawer base/i.test(sku.description ?? "")) return { kind: "corner-drawer" as const, pattern: null };
  if (sku.cornerGeometryKind === "base-end" || /end-angle|base_end_angle|end-return|base_end_return/.test(graphic) || /^(?:bec|ba)[-_]?\d/i.test(sku.masterCode) || /base end (?:corner|cabinet|return)/i.test(sku.description ?? "")) return { kind: "end-return" as const, pattern: null };
  if (sku.cornerGeometryKind === "triangle" || sku.cornerType === "triangle" || /^(?:wtc|btc)[-_]?\d/i.test(sku.masterCode)) return { kind: "triangle-corner" as const, pattern: null };
  if (sku.cornerGeometryKind === "blind-corner" || sku.cornerType === "blind-corner" || /^(?:bbc|wbc|bbl|bbr|wbl|wbr)[-_]?\d/i.test(sku.masterCode)) return { kind: "blind-corner" as const, pattern: null };
  if (sku.cornerGeometryKind === "l-shape" || sku.cornerType === "l-shape" || /^(?:LSB?)[-_]?\d/i.test(sku.masterCode) || /lazy\s*susan/i.test(sku.description ?? "")) {
    return { kind: "l-corner" as const, pattern: null };
  }
  if (sku.cornerGeometryKind === "diagonal" || sku.cornerType === "diagonal" || /^wdc[-_]?\d/i.test(sku.masterCode) || /diagonal wall corner/i.test(sku.description ?? "")) {
    return { kind: "diagonal-corner" as const, pattern: null };
  }
  if (sku.facePattern) return { kind: "face-pattern" as const, pattern: sku.facePattern };
  if (/\b(?:wine|lattice|plate)\b/i.test(`${sku.masterCode} ${sku.description ?? ""}`)) return { kind: "face-pattern" as const, pattern: "lattice" as const };
  return { kind: "standard" as const, pattern: null };
}

function isAngledWallProfile(sku: Pick<SceneSku, "graphicType" | "customProfile" | "masterCode" | "description">) {
  const graphic = `${sku.graphicType ?? ""} ${sku.customProfile ?? ""}`.toLowerCase();
  return /(?:^|\s)wall_angle(?:\s|$)|angled-wall/.test(graphic)
    || /^aw[-_]?\d/i.test(sku.masterCode)
    || /\bangled wall\b/i.test(sku.description ?? "");
}

export function addCabinet(
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
  onDoorTextureState?: (state: "loading" | "loaded" | "failed") => void,
) {
  const placement = (sku.placementType ?? "base").toLowerCase();
  const isWall = placement === "wall";
  const isTall = placement === "tall";
  const isBaseCabinet = placement === "base";
  const isFloorDishwasher = placement === "appliance" && /(?:^|[-_])DW(?:[-_]|\d|$)|dishwasher/i.test(`${sku.masterCode} ${sku.description ?? ""}`);
  const isPlacedHood = placement === "appliance" && /HOOD/i.test(sku.masterCode);
  const isFreestandingRange = placement === "appliance" && !isPlacedHood && (/^RANGE[-_]?\d/i.test(sku.masterCode) || /freestanding\s+range|range\s*\/\s*stove/i.test(sku.description ?? ""));
  const rangeAppearance = isFreestandingRange ? rangeVisualAppearance(sku) : null;
  const isFarmhouseSinkBase = placement === "base" && (/^(?:ada[-_])?fsb[-_]?\d/i.test(sku.masterCode) || /farm(?:house)?\s+sink|apron[-\s]?front/i.test(sku.description ?? ""));
  const isRefrigeratorEndPanel = /refrigerator[-\s]?end[-\s]?panel|refrigerator-end-panel|\brepv\b/i.test(`${sku.description ?? ""} ${sku.masterCode ?? ""} ${sku.customProfile ?? ""}`);
  const lCornerLegRatio = isWall ? 0.5 : 2 / 3;
  const widthIn = numberValue(sku.width, 24);
  const depthIn = numberValue(sku.depth, isWall ? WALL_DEPTH : BASE_DEPTH);
  const configuredHeightIn = numberValue(sku.height, isWall ? 30 : isTall ? 84 : 34.5);
  const resolvedHeightIn = isFreestandingRange
    ? Math.max(STD.RANGE_COOKING_SURFACE_HEIGHT, configuredHeightIn)
    : configuredHeightIn;
  const catalogMountBottom = sku.mountBottom != null
    ? numberValue(sku.mountBottom, 0)
    : (isWd18CountertopDrawerCabinet({ masterCode: sku.masterCode, placement })
      ? STD.COUNTERTOP_HEIGHT
      : isWall ? WALL_BOTTOM : isBaseCabinet ? THREE_D_TOE_KICK : 0);
  const requestedMountBottom = transform?.bottom ?? catalogMountBottom;
  // A cabinet that physically stands on the floor always has a recessed 4½in
  // kick. This includes tall cabinets and a wall profile deliberately dropped
  // to floor level; wall cabinets mounted above the floor are excluded.
  const isFloorStandingCabinet = placement !== "appliance"
    && !isRefrigeratorEndPanel
    && (isBaseCabinet || isTall || (isWall && requestedMountBottom <= 0.001));
  // The saved 2D base height is 34½ inches inclusive of the 4½-inch recessed
  // toe kick. Build only the upper carcass over that kick so every floor run
  // keeps its measured top while exposing the proper floor recess in 3D.
  const heightIn = isFloorStandingCabinet
    ? Math.max(0.1, resolvedHeightIn - THREE_D_TOE_KICK)
    : isFloorDishwasher
      ? 34.5
      : resolvedHeightIn;
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
  const bottom = isFloorStandingCabinet ? THREE_D_TOE_KICK : requestedMountBottom;
  const countertopCenterY = (bottom + heightIn + 0.75) * INCH;
  const cabinet = new THREE.Group();
  cabinet.position.set(x * INCH, (bottom + heightIn / 2) * INCH, z * INCH);
  cabinet.rotation.y = rotation;
  cabinet.userData = {
    placedUid: sku.placementUid ?? null,
    distributorSkuId: sku.distributorSkuId,
    masterCode: sku.masterCode,
    label: sku.description ?? sku.masterCode,
    cornerGeometryKind: sku.cornerGeometryKind ?? "standard",
    ...(isFloorStandingCabinet ? { floorStandingCabinet: true, toeKickHeightIn: THREE_D_TOE_KICK } : {}),
    ...(placement === "appliance" ? {
      catalogApplianceEnvelope: {
        widthIn,
        heightIn,
        depthIn,
        mountBottomIn: bottom,
        rotation,
      },
    } : {}),
    ...(isPlacedHood ? { wallMountedAppliance: true, noCabinetBacking: true } : {}),
  };
  // FSB catalog rows can carry generic base metadata, so recognize their
  // code/description at scene construction as well as in profile resolution.
  const specialty = isFarmhouseSinkBase
    ? { kind: "farmhouse-sink" as const, pattern: null }
    : resolvedThreeDSpecialtyProfile(sku);
  const angledWallProfile = isAngledWallProfile(sku);

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#c6b9a7", roughness: 0.72 });
  const structuralFinishMaterials: THREE.MeshStandardMaterial[] = [bodyMaterial];
  let applyPlainStructuralFinish: ((finishColor: string) => void) | null = null;
  const bodyMeshes: THREE.Mesh[] = [];
  if (isFloorStandingCabinet) {
    const toeKickHeight = THREE_D_TOE_KICK * INCH;
    const toeKickMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.64, metalness: 0.01 });
    structuralFinishMaterials.push(toeKickMaterial);
    const lCornerKind = specialty.kind === "corner-drawer" || specialty.kind === "l-corner";
    if (lCornerKind) {
      // L-corner toe kicks follow the same two-leg carcass geometry so the
      // recessed kick is continuous around the corner rather than a square box.
      const lShape = lCornerCarcassParts(bodyWidth, bodyDepth, lCornerLegRatio);
      for (const part of [lShape.backLeg, lShape.sideLeg]) {
        const legKick = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(0.12, part.width - 0.06), toeKickHeight, Math.max(0.12, part.depth - 0.12)),
          toeKickMaterial,
        );
        legKick.position.set(part.x, -bodyHeight / 2 - toeKickHeight / 2, part.z - 0.06);
        legKick.userData = { baseToeKick: true, lCornerToeKick: true, toeKickHeightIn: THREE_D_TOE_KICK };
        cabinet.add(legKick);
        bodyMeshes.push(legKick);
      }
    } else if (specialty.kind === "end-return") {
      const attachedFronts = baseEndAttachedFrontLayout(bodyWidth, bodyDepth);
      const toeKickRecess = 3 * INCH;
      const toeKickThickness = 0.08;
      for (const face of attachedFronts.supportFaces) {
        const toeKick = new THREE.Mesh(
          new THREE.BoxGeometry(attachedFronts.sideLength, toeKickHeight, toeKickThickness),
          toeKickMaterial,
        );
        const normalX = Math.sin(face.rotation);
        const normalZ = Math.cos(face.rotation);
        // The decorative face belongs at the cabinet boundary; the 4½-inch
        // support begins three inches behind that boundary, not flush with it.
        toeKick.position.set(
          face.x - normalX * (toeKickRecess + 0.028 + toeKickThickness / 2),
          -bodyHeight / 2 - toeKickHeight / 2,
          face.z - normalZ * (toeKickRecess + 0.028 + toeKickThickness / 2),
        );
        toeKick.rotation.y = face.rotation;
        toeKick.userData = {
          baseToeKick: true,
          floorStandingToeKick: true,
          toeKickHeightIn: THREE_D_TOE_KICK,
          endReturnToeKick: true,
          nonCornerEndReturnToeKick: true,
          attachedEndFrontToeKick: face.side,
          toeKickFaceWidthIn: attachedFronts.sideLength / INCH,
          toeKickRecessIn: 3,
        };
        cabinet.add(toeKick);
        bodyMeshes.push(toeKick);
      }
    } else {
      const toeKick = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.12, bodyWidth - 0.08), toeKickHeight, Math.max(0.12, bodyDepth - 0.25)),
        toeKickMaterial,
      );
      // Recess the toe-kick three inches from the cabinet face, matching the
      // shared 2D base-cabinet convention rather than drawing a floor-to-front box.
      toeKick.position.set(0, -bodyHeight / 2 - toeKickHeight / 2, -0.125);
      toeKick.userData = {
        baseToeKick: true,
        floorStandingToeKick: true,
        toeKickHeightIn: THREE_D_TOE_KICK,
        toeKickRecessIn: 3,
      };
      cabinet.add(toeKick);
      bodyMeshes.push(toeKick);
    }
  }
  if (isFloorDishwasher) {
    // A built-in dishwasher is a floor appliance inside a base opening: its
    // appliance face begins above the same 4½-inch recessed kick as adjacent
    // base cabinets, while its full catalog envelope remains authoritative.
    const toeKickHeight = THREE_D_TOE_KICK * INCH;
    const dishwasherKick = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.12, bodyWidth - 0.08), toeKickHeight, Math.max(0.12, bodyDepth - 0.25)),
      new THREE.MeshStandardMaterial({ color: "#302820", roughness: 0.78 }),
    );
    // Unlike a base carcass, a dishwasher's 34½-inch envelope already starts
    // at floor level, so its recessed support is positioned inside that full
    // appliance height and still spans exactly floor-to-4½ inches.
    dishwasherKick.position.set(0, -bodyHeight / 2 + toeKickHeight / 2, -0.125);
    dishwasherKick.userData = { dishwasherToeKick: true, toeKickHeightIn: THREE_D_TOE_KICK, floorApplianceSupport: true };
    cabinet.add(dishwasherKick);
    bodyMeshes.push(dishwasherKick);
  }
  if (specialty.kind === "corner-drawer" || specialty.kind === "l-corner") {
    const lShape = lCornerCarcassParts(bodyWidth, bodyDepth, lCornerLegRatio);
    for (const part of [lShape.backLeg, lShape.sideLeg]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(part.width, bodyHeight, part.depth), bodyMaterial);
      leg.position.set(part.x, 0, part.z);
      leg.userData = { specialtyProfile: specialty.kind, lCornerCarcass: true, selectedStyleSideSkin: true };
      cabinet.add(leg);
      bodyMeshes.push(leg);
    }
  } else if (specialty.kind === "end-return") {
    const diagram = baseEndAttachedFrontLayout(bodyWidth, bodyDepth);
    const clippedBody = new THREE.Mesh(baseEndDiagramGeometry(diagram.sideLength, bodyHeight), bodyMaterial);
    clippedBody.userData = {
      specialtyProfile: "end-return",
      nonCornerEndReturnBody: true,
      diagramDefinedRearApexBody: true,
      sideLengthIn: diagram.sideLength / INCH,
      rearApex: diagram.rearApex,
      exteriorApex: diagram.apex,
    };
    cabinet.add(clippedBody);
    bodyMeshes.push(clippedBody);
  } else if (specialty.kind === "diagonal-corner") {
    const wedge = new THREE.Mesh(
      angledWallProfile
        ? triangleCornerWedgeGeometry(bodyWidth, bodyDepth, bodyHeight)
        : diagonalCornerWedgeGeometry(bodyWidth, bodyDepth, bodyHeight),
      bodyMaterial,
    );
    wedge.userData = angledWallProfile
      ? { specialtyProfile: "angled-wall", angledWallWedge: true, selectedStyleSideSkin: true }
      : { specialtyProfile: "diagonal-corner", diagonalCornerWedge: true, selectedStyleSideSkin: true };
    cabinet.add(wedge);
    bodyMeshes.push(wedge);
  } else if (specialty.kind === "triangle-corner") {
    const wedge = new THREE.Mesh(triangleCornerWedgeGeometry(bodyWidth, bodyDepth, bodyHeight), bodyMaterial);
    wedge.userData = { specialtyProfile: "triangle-corner", triangleCornerWedge: true, selectedStyleSideSkin: true };
    cabinet.add(wedge);
    bodyMeshes.push(wedge);
  } else if (isFreestandingRange) {
    // A range is a floor appliance, not a cabinet carcass. A dedicated chassis,
    // lower recess, and four feet keep the product front from reading as a box.
    const footHeight = Math.min(0.12, bodyHeight * 0.06);
    const topClearance = 0.06;
    const chassisHeight = Math.max(0.2, bodyHeight - footHeight - topClearance);
    const chassisMaterial = new THREE.MeshStandardMaterial({ color: rangeAppearance?.bodyColor ?? "#1b2026", roughness: 0.34, metalness: 0.58 });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth - 0.045, chassisHeight, bodyDepth - 0.035), chassisMaterial);
    chassis.position.y = -bodyHeight / 2 + footHeight + chassisHeight / 2;
    chassis.userData = { applianceCode: sku.masterCode, freestandingRangeChassis: true, rangeFloorClearanceIn: footHeight / INCH, rangeFinish: rangeAppearance?.finish, rangeFuel: rangeAppearance?.fuel };
    cabinet.add(chassis);

    const footWidth = Math.max(0.07, Math.min(0.11, bodyWidth * 0.055));
    const footDepth = Math.max(0.09, Math.min(0.14, bodyDepth * 0.07));
    for (const xSign of [-1, 1] as const) {
      for (const zSign of [-1, 1] as const) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(footWidth, footHeight, footDepth), chassisMaterial);
        const isFrontFoot = zSign === 1;
        foot.position.set(
          xSign * (bodyWidth / 2 - footWidth * 0.8),
          -bodyHeight / 2 + footHeight / 2,
          isFrontFoot ? bodyDepth / 2 + 0.12 : -bodyDepth / 2 + footDepth * 0.8,
        );
        foot.userData = { applianceCode: sku.masterCode, freestandingRangeFoot: true, visibleFreestandingRangeFoot: isFrontFoot, floorApplianceSupport: true };
        cabinet.add(foot);
      }
    }
    const toeRecess = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth * 0.72, Math.max(0.06, footHeight * 0.78), 0.028),
      new THREE.MeshStandardMaterial({ color: "#080b0e", roughness: 0.5, metalness: 0.28 }),
    );
    toeRecess.position.set(0, -bodyHeight / 2 + footHeight * 0.72, bodyDepth / 2 + 0.122);
    toeRecess.userData = { applianceCode: sku.masterCode, freestandingRangeToeRecess: true };
    cabinet.add(toeRecess);
  } else if (!isPlacedHood) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth), bodyMaterial);
    body.userData = {
      selectedStyleSideSkin: true,
      ...(specialty.kind === "blind-corner" ? { specialtyProfile: "blind-corner", blindCornerBody: true } : {}),
    };
    cabinet.add(body);
    bodyMeshes.push(body);
  }

  const textureMaterials: Array<THREE.MeshStandardMaterial | THREE.MeshBasicMaterial> = [];
  const applyDoorTextureFallback = () => {
    const fallback = threeDDoorMaterialFallback(color);
    for (const material of textureMaterials) {
      material.map = fallback.map;
      material.color.set(fallback.color);
      material.needsUpdate = true;
    }
  };
  const useDoorTexture = threeDUsesDoorSampleTexture(doorSampleUrl);
  const doorTexture = useDoorTexture && doorSampleUrl
    ? new THREE.TextureLoader().load(doorSampleUrl, (loadedTexture) => {
      applyPlainStructuralFinish?.(threeDDoorTextureAverageColor(loadedTexture, color));
      onDoorTextureState?.("loaded");
    }, undefined, () => {
      applyDoorTextureFallback();
      onDoorTextureState?.("failed");
    })
    : null;
  if (doorTexture) onDoorTextureState?.("loading");
  if (doorTexture) {
    doorTexture.colorSpace = THREE.SRGBColorSpace;
    doorTexture.wrapS = THREE.ClampToEdgeWrapping;
    doorTexture.wrapT = THREE.ClampToEdgeWrapping;
    doorTexture.repeat.set(1, 1);
  }
  // The active catalog sample is applied to actual door and drawer panels. The
  // physical rails and stiles stay slightly darker and untextured so the chosen
  // Shaker or raised profile remains visibly constructed instead of flat.
  const faceColor = threeDFaceMaterialColor(color, Boolean(doorTexture));
  const faceMaterial = threeDUsesExactDoorSampleMaterial(Boolean(doorTexture))
    ? new THREE.MeshBasicMaterial({ color: faceColor, map: doorTexture })
    : new THREE.MeshStandardMaterial({ color: faceColor, map: null, roughness: 0.42, metalness: 0.01 });
  const structuralFinish = threeDStructuralFinish(color, Boolean(doorTexture));
  let plainStructuralColor = structuralFinish.color;
  const applyStructuralFinish = (finishColor: string) => {
    plainStructuralColor = finishColor;
    for (const material of structuralFinishMaterials) {
    material.color.set(structuralFinish.color);
    material.color.set(finishColor);
    material.map = null;
    material.roughness = 0.5;
    material.needsUpdate = true;
    material.userData = { selectedFinishStructuralSurface: true, usesDoorSample: false };
    }
  };
  applyPlainStructuralFinish = applyStructuralFinish;
  applyStructuralFinish(structuralFinish.color);
  if (doorTexture?.image) {
    applyStructuralFinish(threeDDoorTextureAverageColor(doorTexture, color));
  }
  const trimMaterial = new THREE.MeshStandardMaterial({ color: faceColor, map: doorTexture, roughness: 0.46, metalness: 0.01 });
  textureMaterials.push(faceMaterial);
  const drawerRevealMaterial = new THREE.LineBasicMaterial({ color: "#302a24", transparent: true, opacity: 0.58 });
  const hardwareMaterial = new THREE.MeshStandardMaterial({ color: "#b8bbc0", roughness: 0.2, metalness: 0.86 });
  const shadowRevealMaterial = new THREE.MeshStandardMaterial({ color: "#1c1814", roughness: 0.78, metalness: 0.02, transparent: true, opacity: 0.52 });
  // Side skins inherit the selected finish color but must never project the door
  // sample image or Shaker panel layout onto a cabinet end. The actual door sample
  // is reserved for true front meshes above; the carcass gets a flush finish skin.
  bodyMaterial.userData = { selectedFinishSideSkin: true, usesDoorImage: false };
  // Every decorative standard front must remain on the physical exterior of the
  // carcass. The former 0.015-ft group offset placed the inner face of a 0.045-
  // or 0.052-ft door mesh inside the box. Seat the deepest supported front just
  // beyond the box plane, leaving a small deterministic clearance while keeping
  // its left/right edges constrained by the configured cabinet width below.
  const faceDepth = bodyDepth / 2 + 0.052 / 2 + 0.004;
  // A verified Cabinet Config product visual carries the supplied cabinet's
  // actual front layout. Keep the measured 3D carcass behind it, but place the
  // provided visual on the visible face instead of inventing a generic panel.
  const catalogFrontVisualUrl = threeDCabinetFrontVisualUrl(sku);
  const hasVerifiedDoorLayout = threeDHasVerifiedDoorLayout(sku);
  // The admin panel door sample (doorSampleUrl) is the SOLE authoritative face
  // texture. When it exists, NEVER overlay the Cabinet Config line-art drawing.
  // The catalog front visual is only used as a fallback for cabinets that have
  // NO active door style sample at all.
  if (catalogFrontVisualUrl && threeDUsesCatalogFrontVisual({
    hasCatalogFrontVisual: Boolean(catalogFrontVisualUrl),
    hasDoorSample: Boolean(doorSampleUrl),
    hasDoorTexture: Boolean(doorTexture),
    specialtyKind: specialty.kind,
    isRefrigeratorEndPanel,
    hasVerifiedDoorLayout,
  })) {
    const frontVisualTexture = new THREE.TextureLoader().load(catalogFrontVisualUrl);
    frontVisualTexture.colorSpace = THREE.SRGBColorSpace;
    const frontVisualMaterial = new THREE.MeshBasicMaterial({
      map: frontVisualTexture,
      color: "#ffffff",
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
    });
    const visualHeight = bodyHeight + (isFloorStandingCabinet ? THREE_D_TOE_KICK * INCH : 0);
    const frontVisual = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(0.08, bodyWidth - 0.02), Math.max(0.08, visualHeight - 0.02)),
      frontVisualMaterial,
    );
    frontVisual.position.set(0, isFloorStandingCabinet ? -(THREE_D_TOE_KICK * INCH) / 2 : 0, faceDepth + 0.012);
    frontVisual.renderOrder = 4;
    frontVisual.userData = {
      authoritativeCabinetFrontVisual: true,
      cabinetFrontVisualUrl: catalogFrontVisualUrl,
      source: "Cabinet Config",
    };
    cabinet.add(frontVisual);
  }
  // Standard catalog cabinets need a visible constructed face frame behind their
  // door/drawer fronts. This keeps slab, raised-panel, and shaker selections
  // equally dimensional instead of relying on the Shaker rail overlay alone.
  const usesConstructedFaceFrame = placement !== "appliance"
    && !isRefrigeratorEndPanel
    && !["diagonal-corner", "triangle-corner", "l-corner", "corner-drawer", "end-return", "blind-corner"].includes(specialty.kind);
  if (usesConstructedFaceFrame) {
    const frameMaterial = new THREE.MeshStandardMaterial({ color: plainStructuralColor, roughness: 0.46, metalness: 0.01 });
    structuralFinishMaterials.push(frameMaterial);
    const frameDepth = 0.028;
    const frameWidth = Math.min(0.095, Math.max(0.055, Math.min(bodyWidth, bodyHeight) * 0.075));
    const frameGroup = new THREE.Group();
    frameGroup.position.z = faceDepth - frameDepth * 0.65;
    frameGroup.userData = { cabinetFaceFrame: true, constructedCarcassDetail: true, faceFrameWidthIn: frameWidth / INCH };
    const framePieces = [
      [bodyWidth, frameWidth, 0, bodyHeight / 2 - frameWidth / 2],
      [bodyWidth, frameWidth, 0, -bodyHeight / 2 + frameWidth / 2],
      [frameWidth, Math.max(0.02, bodyHeight - frameWidth * 2), -bodyWidth / 2 + frameWidth / 2, 0],
      [frameWidth, Math.max(0.02, bodyHeight - frameWidth * 2), bodyWidth / 2 - frameWidth / 2, 0],
    ] as const;
    for (const [pieceWidth, pieceHeight, x, y] of framePieces) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(pieceWidth, pieceHeight, frameDepth), frameMaterial);
      frame.position.set(x, y, 0);
      frame.userData = { cabinetFaceFrame: true, constructedCarcassDetail: true };
      frameGroup.add(frame);
    }
    cabinet.add(frameGroup);
  }
  const resolvedFaceLayout = resolvedThreeDFaceLayout(sku);
  // Sink bases use false drawer fronts above their doors. Some catalog rows
  // omit those non-operable fronts from `numberOfDrawers`; the physical SB/CSB
  // front standard is still two false fronts over its standard door pair.
  const isStandardSinkBase = placement === "base" && /^(?:SB|CSB)[-_]?\d/i.test(sku.masterCode ?? "");
  const hasConfiguredOpening = resolvedFaceLayout.hasConfiguredOpening;
  const doorCount = isStandardSinkBase ? Math.max(2, resolvedFaceLayout.doorCount) : resolvedFaceLayout.doorCount;
  const drawerCount = isStandardSinkBase ? Math.max(2, resolvedFaceLayout.drawerCount) : resolvedFaceLayout.drawerCount;
  const usableHeight = bodyHeight - 0.08;
  const wd18Layout = wd18CountertopFaceLayout(
    { masterCode: sku.masterCode, placement, numberOfDrawers: drawerCount },
    usableHeight / INCH,
  );
  const configuredDrawerHeight = sku.drawerHeight != null ? numberValue(sku.drawerHeight, 0) * INCH : 0;
  // A drawer-only cabinet's authored rows own its whole usable face. The former
  // generic 35% allowance left an invented blank upper section in 3D even though
  // the 2D elevation renders the saved drawer stack full height.
  const drawerHeight = wd18Layout
    ? wd18Layout.drawerHeights.reduce((sum, heightIn) => sum + heightIn, 0) * INCH
    : threeDDrawerZoneHeight({
    availableHeight: usableHeight,
    drawerCount,
    doorCount,
    configuredDrawerHeight,
    hasConfiguredOpening,
    placement,
  });
  const configuredDoorHeight = sku.doorHeight != null ? numberValue(sku.doorHeight, 0) * INCH : 0;
  const doorHeight = Math.max(0.2, wd18Layout ? wd18Layout.doorHeight * INCH : configuredDoorHeight || usableHeight - drawerHeight);
  const frontGroup = new THREE.Group();
  frontGroup.userData = {
    decorativeFrontClearanceIn: 0.004 / INCH,
    physicalFacePlane: true,
    boundedByCarcassFace: true,
  };
  if (specialty.kind === "end-return") {
    frontGroup.userData = {
      ...frontGroup.userData,
      becAttachedTwoFaceEnd: true,
      separateProjectedThirdFace: false,
    };
  }
  // Specialty fronts use absolute local positions on their physical footprint.
  // In particular, BEC must not inherit the generic rectangular front-depth
  // offset: that offset creates a separate third face ahead of its clipped
  // 45-degree end plane.
  frontGroup.position.z = specialty.kind === "diagonal-corner" || specialty.kind === "triangle-corner" || specialty.kind === "l-corner" || specialty.kind === "end-return" ? 0 : faceDepth;
  for (const side of threeDDecorativeEndSides(sku.decorativeEnd)) {
    const endPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.042, Math.max(0.12, bodyHeight - 0.05), Math.max(0.12, bodyDepth - 0.05)),
      faceMaterial,
    );
    endPanel.position.set(side * (bodyWidth / 2 + 0.022), 0, -faceDepth);
    endPanel.userData = { decorativeEndPanel: true, decorativeEndSide: side === -1 ? "left" : "right", explicitEndTreatment: true };
    frontGroup.add(endPanel);
  }
  const profileKind = doorProfileKind(doorProfile?.doorStyle, doorProfile?.doorPanelType);
  const addShakerFrame = (faceWidth: number, faceHeight: number, x: number, y: number, z = 0.036, rotationY = 0) => {
    if (!threeDUsesPhysicalShakerRails(profileKind, Boolean(doorTexture))) return;
    const rail = threeDShakerRailThickness(faceWidth, faceHeight);
    if (!rail) return;
    const frameGroup = new THREE.Group();
    const pose = threeDShakerFramePose(x, y, z, rotationY);
    frameGroup.position.set(pose.x, pose.y, pose.z);
    frameGroup.rotation.y = pose.rotationY;
    frameGroup.userData = { selectedStyleFace: "shaker", physicalRails: true };
    const pieces = [
      [faceWidth, rail, 0, faceHeight / 2 - rail / 2],
      [faceWidth, rail, 0, -faceHeight / 2 + rail / 2],
      [rail, Math.max(0.02, faceHeight - rail * 2), -faceWidth / 2 + rail / 2, 0],
      [rail, Math.max(0.02, faceHeight - rail * 2), faceWidth / 2 - rail / 2, 0],
    ] as const;
    for (const [pieceWidth, pieceHeight, offsetX, offsetY] of pieces) {
      const railMesh = new THREE.Mesh(new THREE.BoxGeometry(pieceWidth, pieceHeight, 0.026), trimMaterial);
      railMesh.position.set(offsetX, offsetY, 0);
      railMesh.userData = { selectedStyleFace: "shaker", physicalRail: true };
      frameGroup.add(railMesh);
    }
    frontGroup.add(frameGroup);
  };
  const addDrawerReveal = (faceWidth: number, faceHeight: number, x: number, y: number, z = THREE_D_DRAWER_REVEAL_DEPTH) => {
    // Render one recessed backing plane behind the drawer front rather than an
    // EdgesGeometry outline. The old outline sat forward of some physical front
    // layers and produced the ghosted lines visible on painted door/drawer faces.
    const reveal = new THREE.Mesh(
      new THREE.BoxGeometry(faceWidth + 0.018, faceHeight + 0.018, 0.006),
      shadowRevealMaterial,
    );
    reveal.position.set(x, y, z);
    reveal.userData = { cabinetDrawerReveal: true, recessedPhysicalGap: true };
    frontGroup.add(reveal);
  };
  const addFaceShadow = (faceWidth: number, faceHeight: number, x: number, y: number, z = 0.008) => {
    const shadow = new THREE.Mesh(new THREE.BoxGeometry(faceWidth + 0.024, faceHeight + 0.024, 0.012), shadowRevealMaterial);
    shadow.position.set(x, y, z);
    shadow.userData = { cabinetFaceShadowGap: true, dimensionalCabinetDetail: true };
    frontGroup.add(shadow);
  };
  const addPull = (faceWidth: number, faceHeight: number, x: number, y: number, drawer = false, z = 0.086, doorZone: "upper" | "lower" = "lower", hingeSide: "left" | "right" | null = null, hardwarePosition = sku.hardwarePosition ?? sku.handleSide ?? "auto") => {
    const pullLength = Math.min(Math.max(0.12, (drawer ? faceWidth : faceHeight) * (drawer ? 0.48 : 0.28)), drawer ? 0.62 : 0.86);
    const pull = new THREE.Mesh(new THREE.BoxGeometry(drawer ? pullLength : 0.022, drawer ? 0.022 : pullLength, 0.026), hardwareMaterial);
    // Doors swing from their outside edge. Pulls therefore sit vertically at
    // the center meeting edge (opposite hinge). Upper doors pull from the
    // lower part; lower/pantry doors pull from the upper part.
    const automaticSide = hingeSide === "left" ? 1 : hingeSide === "right" ? -1 : -Math.sign(x || 1);
    // Drawers are fixed at the horizontal center by CabinetDealz construction
    // rules. Saved hardware choices remain effective only for door pulls.
    const resolvedHardwarePosition = drawer ? "center" : normalizeDoorHardwareFramePosition(hardwarePosition);
    const explicitSide = resolvedHardwarePosition === "left" ? -1 : resolvedHardwarePosition === "right" ? 1 : resolvedHardwarePosition === "center" ? 0 : automaticSide;
    const pullX = drawer
      ? x
      : x + doorHardwareOffsetFromFaceCenterIn(
        faceWidth / INCH,
        explicitSide < 0 ? "left" : explicitSide > 0 ? "right" : "center",
      ) * INCH;
    const pullY = drawer ? y : y + (doorZone === "upper" ? -1 : 1) * faceHeight * 0.3;
    pull.position.set(pullX, pullY, z);
    pull.userData = {
      cabinetHardware: true,
      cabinetPull: drawer ? "drawer" : "door",
      verticalPull: !drawer,
      pullDoorZone: drawer ? null : doorZone,
      pullEdge: resolvedHardwarePosition === "auto" || resolvedHardwarePosition === "paired" ? (drawer ? "center" : "opposite-hinge") : resolvedHardwarePosition,
      ...(hingeSide ? { hingeSide, handleSide: resolvedHardwarePosition === "auto" || resolvedHardwarePosition === "paired" ? hingeSide === "left" ? "right" : "left" : resolvedHardwarePosition } : { handleSide: resolvedHardwarePosition === "auto" || resolvedHardwarePosition === "paired" ? (automaticSide < 0 ? "left" : "right") : resolvedHardwarePosition }),
      hardwarePosition: resolvedHardwarePosition,
      ...(drawer || explicitSide === 0 ? {} : { frameWidthIn: 3, frameCenterInsetIn: FRAMED_STILE_CENTER_IN }),
      dimensionalCabinetDetail: true,
    };
    frontGroup.add(pull);
    for (const offset of [-1, 1] as const) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 10), hardwareMaterial);
      stem.rotation.x = Math.PI / 2;
      stem.position.set(drawer ? pull.position.x + offset * pullLength * 0.34 : pull.position.x, drawer ? pull.position.y : pull.position.y + offset * pullLength * 0.34, z - 0.018);
      stem.userData = { cabinetHardwareMount: true };
      frontGroup.add(stem);
    }
  };
  const isPlacedAppliance = placement === "appliance";
  const singleDoorHinge: "left" | "right" = sku.swing === "right" ? "right" : "left";
  const isOvenCabinet = !isPlacedAppliance && Boolean(sku.ovenType || /(?:^|[-_])(UOC|OC|OVEN)|oven cabinet/i.test(sku.masterCode + " " + (sku.description ?? "")));
  if (isRefrigeratorEndPanel) {
    // Finished refrigerator enclosure panels have no doors, drawers, pulls, or
    // toe kicks. They are plain floor-to-ceiling architectural skins matching
    // the selected cabinet finish on both sides of the refrigerator.
    const panelFace = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth, bodyHeight, 0.032), faceMaterial);
    panelFace.position.z = 0.034;
    panelFace.userData = { refrigeratorEndPanel: true, architecturalPanel: true, noCabinetHardware: true, selectedFinishFace: true };
    frontGroup.add(panelFace);
  } else if (isPlacedAppliance) {
    const isPanelReadyAppliance = /panel[-\s]?ready|integrated appliance/i.test(sku.description ?? "");
    const applianceMaterial = new THREE.MeshStandardMaterial({
      color: isPanelReadyAppliance ? faceColor : rangeAppearance?.bodyColor ?? "#c7cbd0",
      map: isPanelReadyAppliance ? doorTexture : null,
      roughness: isPanelReadyAppliance ? 0.42 : 0.24,
      metalness: isPanelReadyAppliance ? 0.04 : 0.62,
    });
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
      intake.userData = { applianceCode: sku.masterCode, rangeHoodIntake: true, dimensionalApplianceDetail: true };
      frontGroup.add(intake);
      const hoodDetailMaterial = new THREE.MeshStandardMaterial({ color: "#5a626b", roughness: 0.24, metalness: 0.76 });
      for (const offset of [-0.18, 0, 0.18] as const) {
        const vent = new THREE.Mesh(new THREE.BoxGeometry(hood.width * 0.16, 0.012, 0.032), hoodDetailMaterial);
        vent.position.set(offset * hood.width, -bodyHeight / 2 + hood.canopyHeight * 0.52, 0.112);
        vent.userData = { applianceCode: sku.masterCode, rangeHoodVent: true, dimensionalApplianceDetail: true };
        frontGroup.add(vent);
      }
      for (const offset of [-0.05, 0.05] as const) {
        const button = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 12), hoodDetailMaterial);
        button.rotation.x = Math.PI / 2;
        button.position.set(offset, -bodyHeight / 2 + hood.canopyHeight * 0.27, 0.112);
        button.userData = { applianceCode: sku.masterCode, rangeHoodControl: true, dimensionalApplianceDetail: true };
        frontGroup.add(button);
      }
    } else {
      const dishwasherToeKickHeight = THREE_D_TOE_KICK * INCH;
      const applianceFaceHeight = isFloorDishwasher ? Math.max(0.2, bodyHeight - dishwasherToeKickHeight) : bodyHeight - 0.06;
      const applianceFace = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth - 0.06, applianceFaceHeight, 0.05), applianceMaterial);
      if (isFloorDishwasher) applianceFace.position.y = dishwasherToeKickHeight / 2;
      if (isFloorDishwasher) applianceFace.userData = { applianceCode: sku.masterCode, dishwasherFlushFace: true, floorApplianceFace: true };
      frontGroup.add(applianceFace);
      const rangeLayout = /RANGE/.test(code) ? rangeOvenFrontLayout(bodyHeight) : null;
      if (/FRIDGE/.test(code)) {
        const upperHeight = Math.max(0.2, bodyHeight * 0.72);
        const freezerHeight = Math.max(0.16, bodyHeight - upperHeight - 0.1);
        const refrigeratorDoorWidth = (bodyWidth - 0.1) / 2;
        const applianceHandleMaterial = new THREE.MeshStandardMaterial({ color: "#20262c", roughness: 0.2, metalness: 0.82 });
        for (const side of [-1, 1] as const) {
          const refrigeratorDoor = new THREE.Mesh(new THREE.BoxGeometry(refrigeratorDoorWidth - 0.025, upperHeight, 0.064), applianceMaterial);
          refrigeratorDoor.position.set(side * refrigeratorDoorWidth * 0.5, bodyHeight / 2 - upperHeight / 2 - 0.035, 0.042);
          refrigeratorDoor.userData = { applianceCode: sku.masterCode, refrigeratorDoor: side === -1 ? "left" : "right", applianceFront: true };
          frontGroup.add(refrigeratorDoor);
          const handle = new THREE.Mesh(new THREE.BoxGeometry(0.042, upperHeight * 0.72, 0.052), applianceHandleMaterial);
          handle.position.set(side * refrigeratorDoorWidth * 0.13, refrigeratorDoor.position.y, 0.092);
          handle.userData = { applianceCode: sku.masterCode, refrigeratorHandle: side === -1 ? "left" : "right", dimensionalApplianceDetail: true };
          frontGroup.add(handle);
        }
        const freezer = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth - 0.1, freezerHeight, 0.064), applianceMaterial);
        freezer.position.set(0, -bodyHeight / 2 + freezerHeight / 2 + 0.03, 0.042);
        freezer.userData = { applianceCode: sku.masterCode, refrigeratorFreezer: true, applianceFront: true, ...(isPanelReadyAppliance ? { panelReadyFinish: true } : {}) };
        frontGroup.add(freezer);
        const freezerHandle = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.6, 0.038, 0.05), applianceHandleMaterial);
        freezerHandle.position.set(0, freezer.position.y + freezerHeight * 0.12, 0.093);
        freezerHandle.userData = { applianceCode: sku.masterCode, refrigeratorFreezerHandle: true, dimensionalApplianceDetail: true };
        frontGroup.add(freezerHandle);
        const dispenser = new THREE.Mesh(new THREE.BoxGeometry(refrigeratorDoorWidth * 0.33, upperHeight * 0.22, 0.03), glassMaterial);
        dispenser.position.set(-refrigeratorDoorWidth * 0.5, bodyHeight / 2 - upperHeight * 0.6, 0.088);
        dispenser.userData = { applianceCode: sku.masterCode, refrigeratorDispenser: true, dimensionalApplianceDetail: true };
        frontGroup.add(dispenser);
        const refrigeratorVent = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.52, 0.028, 0.042), applianceHandleMaterial);
        refrigeratorVent.position.set(0, bodyHeight / 2 - 0.045, 0.084);
        refrigeratorVent.userData = { applianceCode: sku.masterCode, refrigeratorTopVent: true, dimensionalApplianceDetail: true };
        frontGroup.add(refrigeratorVent);
        for (const side of [-1, 1] as const) {
          const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 0.06), applianceHandleMaterial);
          hinge.position.set(side * (bodyWidth * 0.32), bodyHeight / 2 - 0.055, 0.078);
          hinge.userData = { applianceCode: sku.masterCode, refrigeratorHingeCap: side === -1 ? "left" : "right", dimensionalApplianceDetail: true };
          frontGroup.add(hinge);
        }
        const refrigeratorFootMaterial = new THREE.MeshStandardMaterial({ color: "#161a1e", roughness: 0.48, metalness: 0.56 });
        for (const side of [-1, 1] as const) {
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.075, 0.12), refrigeratorFootMaterial);
          foot.position.set(side * (bodyWidth / 2 - 0.12), -bodyHeight / 2 + 0.038, bodyDepth / 2 - 0.1);
          foot.userData = { applianceCode: sku.masterCode, refrigeratorFoot: side === -1 ? "left" : "right", dimensionalApplianceDetail: true };
          cabinet.add(foot);
        }
      } else {
        const openingH = rangeLayout?.openingHeight ?? (isFloorDishwasher
          ? Math.max(0.2, bodyHeight - dishwasherToeKickHeight - 0.22)
          : /SINK/.test(code) ? bodyHeight * 0.56 : bodyHeight * 0.62);
        const openingWidth = isFloorDishwasher ? Math.max(0.2, bodyWidth - 0.14) : bodyWidth * 0.68;
        const opening = new THREE.Mesh(new THREE.BoxGeometry(openingWidth, openingH, 0.064), glassMaterial);
        opening.position.y = rangeLayout?.openingCenterY ?? (isFloorDishwasher ? dishwasherToeKickHeight / 2 : /RANGE|DW|WINE|MW/.test(code) ? -bodyHeight * 0.03 : bodyHeight * 0.04);
        opening.userData = { applianceCode: sku.masterCode, applianceOpening: true, ...(isPanelReadyAppliance ? { panelReadyFinish: true } : {}), ...(isFloorDishwasher ? { dishwasherOpening: true, dishwasherOpeningWidthIn: openingWidth / INCH } : {}) };
        frontGroup.add(opening);
        const isMicrowaveAppliance = /(?:^|[-_])MW|MICROWAVE/.test(code);
        const isOvenAppliance = !isMicrowaveAppliance && /(?:^|[-_])OVEN|SINGLE[-_]?OVEN|DOUBLE[-_]?OVEN/.test(code);
        if (isMicrowaveAppliance || isOvenAppliance) {
          const applianceTrimMaterial = new THREE.MeshStandardMaterial({ color: "#3d444c", roughness: 0.28, metalness: 0.7 });
          const bezelDepth = 0.04;
          const bezelWidth = Math.min(0.08, openingWidth * 0.09);
          const bezelHeight = Math.min(0.08, openingH * 0.1);
          const bezelParts = [
            [openingWidth + bezelWidth * 2, bezelHeight, 0, opening.position.y + openingH / 2 + bezelHeight / 2],
            [openingWidth + bezelWidth * 2, bezelHeight, 0, opening.position.y - openingH / 2 - bezelHeight / 2],
            [bezelWidth, openingH, -openingWidth / 2 - bezelWidth / 2, opening.position.y],
            [bezelWidth, openingH, openingWidth / 2 + bezelWidth / 2, opening.position.y],
          ] as const;
          for (const [bezelW, bezelH, bezelX, bezelY] of bezelParts) {
            const bezel = new THREE.Mesh(new THREE.BoxGeometry(bezelW, bezelH, bezelDepth), applianceTrimMaterial);
            bezel.position.set(bezelX, bezelY, 0.095);
            bezel.userData = { applianceCode: sku.masterCode, applianceBezel: isMicrowaveAppliance ? "microwave" : "oven", dimensionalApplianceDetail: true };
            frontGroup.add(bezel);
          }
          const display = new THREE.Mesh(new THREE.BoxGeometry(openingWidth * 0.32, Math.min(0.05, openingH * 0.12), 0.018), new THREE.MeshStandardMaterial({ color: "#111920", roughness: 0.18, metalness: 0.38 }));
          display.position.set(0, opening.position.y + openingH / 2 + bezelHeight * 0.55, 0.122);
          display.userData = { applianceCode: sku.masterCode, applianceDisplay: isMicrowaveAppliance ? "microwave" : "oven", dimensionalApplianceDetail: true };
          frontGroup.add(display);
          const handle = new THREE.Mesh(new THREE.BoxGeometry(openingWidth * (isMicrowaveAppliance ? 0.42 : 0.62), 0.03, 0.052), applianceTrimMaterial);
          handle.position.set(0, opening.position.y + openingH * 0.3, 0.118);
          handle.userData = { applianceCode: sku.masterCode, applianceDoorHandle: isMicrowaveAppliance ? "microwave" : "oven", dimensionalApplianceDetail: true };
          frontGroup.add(handle);
        }
        if (isFloorDishwasher) {
          const dishwasherDetailMaterial = new THREE.MeshStandardMaterial({ color: "#4a5158", roughness: 0.24, metalness: 0.72 });
          const controlStrip = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth - 0.14, 0.075, 0.032), dishwasherDetailMaterial);
          controlStrip.position.set(0, bodyHeight / 2 - 0.055, 0.083);
          controlStrip.userData = { applianceCode: sku.masterCode, dishwasherControlStrip: true, dimensionalApplianceDetail: true };
          frontGroup.add(controlStrip);
          const dishwasherHandle = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.62, 0.032, 0.052), dishwasherDetailMaterial);
          dishwasherHandle.position.set(0, bodyHeight / 2 - 0.14, 0.09);
          dishwasherHandle.userData = { applianceCode: sku.masterCode, dishwasherHandle: true, dimensionalApplianceDetail: true };
          frontGroup.add(dishwasherHandle);
          for (let index = 0; index < 4; index++) {
            const button = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.016, 0.018), new THREE.MeshStandardMaterial({ color: "#171c21", roughness: 0.34, metalness: 0.4 }));
            button.position.set(-bodyWidth * 0.14 + index * bodyWidth * 0.09, bodyHeight / 2 - 0.055, 0.106);
            button.userData = { applianceCode: sku.masterCode, dishwasherControlButton: index + 1, dimensionalApplianceDetail: true };
            frontGroup.add(button);
          }
          const dishwasherDoorReveal = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth - 0.2, 0.018, 0.02), dishwasherDetailMaterial);
          dishwasherDoorReveal.position.set(0, bodyHeight * 0.05, 0.083);
          dishwasherDoorReveal.userData = { applianceCode: sku.masterCode, dishwasherDoorReveal: true, dimensionalApplianceDetail: true };
          frontGroup.add(dishwasherDoorReveal);
        }
      }
      if (rangeLayout) {
        const storageDrawer = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.8, rangeLayout.drawerHeight, 0.066), applianceMaterial);
        storageDrawer.position.set(0, rangeLayout.drawerCenterY, 0.038);
        storageDrawer.userData = { applianceCode: sku.masterCode, rangeStorageDrawer: true };
        frontGroup.add(storageDrawer);
        const cooktop = rangeCooktopLayout(bodyWidth, bodyDepth, bodyHeight, bottom, rangeAppearance?.controlPosition ?? "rear");
        const rangeProfile = freestandingRangeHeightProfile(bottom, bodyHeight);
        const cooktopSurface = new THREE.Mesh(
          new THREE.BoxGeometry(cooktop.cooktopWidth, cooktop.cooktopThickness, cooktop.cooktopDepth),
          new THREE.MeshStandardMaterial({ color: "#20262d", roughness: 0.2, metalness: 0.48 }),
        );
        cooktopSurface.position.set(0, cooktop.topY, 0);
        cooktopSurface.userData = { applianceCode: sku.masterCode, rangeCooktop: true, rangeControlPosition: cooktop.controlPosition, ...(cooktop.flatFrontControlTop ? { rangeFrontControlFlatCooktop: true } : {}) };
        cabinet.add(cooktopSurface);
        for (const burnerCenter of cooktop.burnerCenters) {
          const burner = new THREE.Mesh(
            new THREE.CylinderGeometry(cooktop.burnerRadius, cooktop.burnerRadius, 0.026, 24),
            new THREE.MeshStandardMaterial({ color: "#11151a", roughness: 0.25, metalness: 0.58 }),
          );
          burner.position.set(burnerCenter.x, cooktop.cookingSurfaceY + 0.013, burnerCenter.z);
          burner.userData = { applianceCode: sku.masterCode, rangeBurner: true, rangeFuel: rangeAppearance?.fuel ?? "electric", rangeCooktopStyle: rangeAppearance?.cooktopStyle ?? "electric-glass" };
          cabinet.add(burner);
          if (rangeAppearance?.cooktopStyle === "gas-grate") {
            for (const rotation of [0, Math.PI / 2]) {
              const grate = new THREE.Mesh(
                new THREE.BoxGeometry(cooktop.burnerRadius * 1.75, 0.018, 0.026),
                new THREE.MeshStandardMaterial({ color: "#14191e", roughness: 0.34, metalness: 0.56 }),
              );
              grate.rotation.y = rotation;
              grate.position.set(burnerCenter.x, cooktop.cookingSurfaceY + 0.034, burnerCenter.z);
              grate.userData = { applianceCode: sku.masterCode, rangeGasGrate: true, dimensionalApplianceDetail: true };
              cabinet.add(grate);
            }
          }
        }
        const frontControlRange = rangeAppearance?.controlPosition === "front";
        if (rangeAppearance?.backPanel !== "none") {
          // A rear-control freestanding range keeps its control panel on a
          // backguard above the shared 34½-inch cooktop line.
          const backguard = new THREE.Mesh(
            new THREE.BoxGeometry(bodyWidth * 0.76, rangeProfile.backguardHeight, 0.075),
            new THREE.MeshStandardMaterial({ color: "#242a31", roughness: 0.3, metalness: 0.62 }),
          );
          backguard.position.set(0, rangeProfile.backguardTopY - rangeProfile.backguardHeight / 2, -bodyDepth * 0.28);
          backguard.userData = { applianceCode: sku.masterCode, rangeBackguard: true, rangeBackguardTopIn: rangeProfile.backguardTopIn, rangeControlPosition: "rear" };
          cabinet.add(backguard);
          const controls = new THREE.Mesh(
            new THREE.BoxGeometry(bodyWidth * 0.56, Math.min(0.13, rangeProfile.backguardHeight * 0.22), 0.026),
            new THREE.MeshStandardMaterial({ color: rangeAppearance?.controlColor ?? "#0c1015", roughness: 0.24, metalness: 0.54 }),
          );
          controls.position.set(0, rangeProfile.backguardTopY - rangeProfile.backguardHeight * 0.38, -bodyDepth * 0.28 + 0.052);
          controls.userData = { applianceCode: sku.masterCode, rangeBackguardControlPanel: true, rangeControlPosition: "rear" };
          cabinet.add(controls);
          const display = new THREE.Mesh(
            new THREE.BoxGeometry(bodyWidth * 0.18, 0.045, 0.016),
            new THREE.MeshStandardMaterial({ color: "#101923", roughness: 0.2, metalness: 0.38 }),
          );
          display.position.set(0, rangeProfile.backguardTopY - rangeProfile.backguardHeight * 0.25, -bodyDepth * 0.28 + 0.095);
          display.userData = { applianceCode: sku.masterCode, rangeRearControlDisplay: true, rangeControlPosition: "rear", dimensionalApplianceDetail: true };
          cabinet.add(display);
        } else {
          const controls = new THREE.Mesh(
            new THREE.BoxGeometry(bodyWidth * 0.76, 0.12, 0.052),
            new THREE.MeshStandardMaterial({ color: rangeAppearance?.controlColor ?? "#0c1015", roughness: 0.24, metalness: 0.54 }),
          );
          controls.position.set(0, bodyHeight / 2 - 0.105, 0.088);
          controls.userData = { applianceCode: sku.masterCode, rangeFrontControlPanel: true, rangeControlPosition: "front" };
          frontGroup.add(controls);
          const display = new THREE.Mesh(
            new THREE.BoxGeometry(bodyWidth * 0.16, 0.045, 0.016),
            new THREE.MeshStandardMaterial({ color: "#101923", roughness: 0.2, metalness: 0.38 }),
          );
          display.position.set(0, bodyHeight / 2 - 0.09, 0.121);
          display.userData = { applianceCode: sku.masterCode, rangeFrontControlDisplay: true, rangeControlPosition: "front", dimensionalApplianceDetail: true };
          frontGroup.add(display);
        }
        const knobMaterial = new THREE.MeshStandardMaterial({ color: "#d8dce0", roughness: 0.18, metalness: 0.86 });
        const gasRange = rangeAppearance?.fuel === "gas";
        const controlCount = rangeAppearance?.controlCount ?? (gasRange ? 5 : 4);
        const controlRadius = gasRange ? 0.033 : 0.027;
        for (let index = 0; index < controlCount; index++) {
          const knob = new THREE.Mesh(new THREE.CylinderGeometry(controlRadius, controlRadius, 0.026, 16), knobMaterial);
          knob.rotation.x = Math.PI / 2;
          knob.position.set(-bodyWidth * 0.28 + index * bodyWidth * (controlCount === 5 ? 0.14 : 0.186), bodyHeight / 2 - 0.105, 0.087);
          knob.userData = { applianceCode: sku.masterCode, rangeControlKnob: index + 1, rangeControlType: gasRange ? "gas-knob" : "electric-control", rangeControlPosition: frontControlRange ? "front" : "rear", dimensionalApplianceDetail: true };
          frontGroup.add(knob);
        }
        const ovenHandle = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.62, 0.038, 0.052), knobMaterial);
        ovenHandle.position.set(0, rangeLayout.openingCenterY + rangeLayout.openingHeight * 0.34, 0.093);
        ovenHandle.userData = { applianceCode: sku.masterCode, rangeOvenHandle: true, dimensionalApplianceDetail: true };
        frontGroup.add(ovenHandle);
      }
      const control = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth * 0.76, Math.min(0.08, bodyHeight * 0.12), 0.066), new THREE.MeshStandardMaterial({ color: rangeAppearance?.controlColor ?? "#3b4147", roughness: 0.3, metalness: 0.45 }));
      control.position.y = bodyHeight / 2 - Math.min(0.1, bodyHeight * 0.14);
      frontGroup.add(control);
    }

    // Range catalog photos are not orthographic product fronts and visibly
    // conflict with the modeled cooktop, knobs, oven glass, handle, feet, and
    // backguard. Ranges therefore use the single measured procedural assembly;
    // product imagery remains available for other appliance types.
    const originalVisualUrl = isFreestandingRange ? null : threeDApplianceFrontVisualUrl(sku);
    if (originalVisualUrl) {
      // Vitest builds the deterministic mesh graph without a DOM. Preserve the
      // front plane and its selected-image contract there, while only requesting
      // the browser image texture in a real WebGL document context.
      const originalTexture = typeof document === "undefined"
        ? null
        : new THREE.TextureLoader().load(originalVisualUrl);
      if (originalTexture) {
        originalTexture.colorSpace = THREE.SRGBColorSpace;
        originalTexture.minFilter = THREE.LinearFilter;
      }
      const rangeFootClearance = isFreestandingRange ? Math.min(0.12, bodyHeight * 0.06) : 0;
      const originalFront = new THREE.Mesh(
        new THREE.PlaneGeometry(
          Math.max(0.12, bodyWidth - 0.035),
          Math.max(0.12, bodyHeight - 0.035 - rangeFootClearance),
        ),
        new THREE.MeshBasicMaterial({ map: originalTexture, transparent: true, alphaTest: 0.02, side: THREE.FrontSide, depthWrite: false }),
      );
      // frontGroup already sits at the true front plane. This small offset shows
      // the original product visual without changing envelope or placement.
      originalFront.position.set(0, rangeFootClearance / 2, 0.085);
      originalFront.userData = {
        applianceCode: sku.masterCode,
        originalProductVisual: true,
        originalProductVisualUrl: originalVisualUrl,
        ...(isFreestandingRange ? { freestandingRangeProductVisual: true, rangeFootClearanceIn: rangeFootClearance / INCH } : {}),
        catalogEnvelope: { widthIn, heightIn, depthIn, mountBottomIn: bottom, rotation },
      };
      frontGroup.add(originalFront);
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
        door.userData = { cabinetFront: true, ovenCabinetDoor: true, flushPhysicalFace: true };
        frontGroup.add(door);
        addShakerFrame(doorWidth - 0.03, Math.max(0.08, height - 0.025), door.position.x, door.position.y, 0.066);
      }
      zoneTop -= height;
    };
    const addSingleOvenFiller = () => {
      if (sku.ovenType !== "single") return;
      const fillerHeight = 3 * INCH;
      const filler = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth - 0.06, fillerHeight, 0.048), bodyMaterial);
      filler.position.set(0, zoneTop - fillerHeight / 2, 0.032);
      filler.userData = { ovenTowerFiller: true, fillerHeightIn: 3, selectedFinishSideSkin: true };
      frontGroup.add(filler);
      zoneTop -= fillerHeight;
    };
    const addDrawers = () => {
      for (const row of ovenLayout.drawerRows) {
        const drawerWidth = (bodyWidth - 0.08) / row.count;
        for (let column = 0; column < row.count; column++) {
          const drawer = new THREE.Mesh(new THREE.BoxGeometry(drawerWidth - 0.025, Math.max(0.08, row.height - 0.025), 0.052), faceMaterial);
          drawer.position.set(-bodyWidth / 2 + 0.04 + drawerWidth * (column + 0.5), zoneTop - row.height / 2, 0.035);
          drawer.userData = { cabinetFront: true, cabinetDrawerFront: true, ovenCabinetDrawer: true, flushPhysicalFace: true };
          frontGroup.add(drawer);
          addDrawerReveal(drawerWidth - 0.025, Math.max(0.08, row.height - 0.025), drawer.position.x, drawer.position.y);
          addShakerFrame(drawerWidth - 0.025, Math.max(0.08, row.height - 0.025), drawer.position.x, drawer.position.y, 0.066);
        }
        zoneTop -= row.height;
      }
    };
    const addOvenCutout = () => {
      const ovenOpeningWidth = ovenOpeningGeometry(bodyWidth / INCH, sku.ovenType).width * INCH;
      const oven = new THREE.Mesh(new THREE.BoxGeometry(ovenOpeningWidth, ovenLayout.openingHeight, 0.07), applianceMaterial);
      oven.position.set(0, zoneTop - ovenLayout.openingHeight / 2, 0.032);
      oven.userData = { ovenOpeningWidthIn: ovenOpeningWidth / INCH, singleOvenInsetIn: ovenOpeningGeometry(bodyWidth / INCH, sku.ovenType).horizontalInset };
      frontGroup.add(oven);
      const singleOvenHeight = ovenLayout.openingHeight / ovenLayout.ovenCount;
      for (let i = 0; i < ovenLayout.ovenCount; i++) {
        const glass = new THREE.Mesh(new THREE.BoxGeometry(ovenOpeningWidth * 0.79, singleOvenHeight * 0.62, 0.078), glassMaterial);
        glass.position.set(0, zoneTop - singleOvenHeight * (i + 0.5), 0.072);
        frontGroup.add(glass);
      }
      zoneTop -= ovenLayout.openingHeight;
    };
    if (sku.ovenType === "single") {
      addDoors(ovenLayout.doorZone);
      addSingleOvenFiller();
      addOvenCutout();
      addDrawers();
    } else if (ovenLayout.openingPosition === "top") {
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
  } else if (isTall && /pantry/i.test(`${sku.masterCode} ${sku.description ?? ""}`)) {
    // A two-door pantry is one tall lower door plus one upper door. Wider pantry
    // models, or records explicitly configured with four doors, retain paired
    // leaves in both the upper and lower openings.
    const lowerDoorHeight = Math.min(bodyHeight - 0.1, 54 * INCH);
    const upperDoorHeight = Math.max(0.2, bodyHeight - lowerDoorHeight - 0.1);
    const doorsPerRow = threeDTallPantryDoorsPerRow(sku);
    const addPantryRow = (height: number, centerY: number, row: "lower" | "upper") => {
      const doorWidth = (bodyWidth - 0.08) / doorsPerRow;
      for (let i = 0; i < doorsPerRow; i++) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.03, Math.max(0.08, height - 0.025), 0.052), faceMaterial);
        door.position.set(-bodyWidth / 2 + 0.04 + doorWidth * (i + 0.5), centerY, 0.035);
        door.userData = { cabinetFront: true, pantryDoorSet: row, pantryDoorsPerRow: doorsPerRow, flushPhysicalFace: true };
        frontGroup.add(door);
        addShakerFrame(doorWidth - 0.03, Math.max(0.08, height - 0.025), door.position.x, door.position.y, 0.066);
        addFaceShadow(doorWidth - 0.03, Math.max(0.08, height - 0.025), door.position.x, door.position.y);
        addPull(doorWidth - 0.03, Math.max(0.08, height - 0.025), door.position.x, door.position.y, false, 0.086, row, doorsPerRow === 1 ? singleDoorHinge : null);
      }
    };
    addPantryRow(lowerDoorHeight, -bodyHeight / 2 + 0.05 + lowerDoorHeight / 2, "lower");
    addPantryRow(upperDoorHeight, bodyHeight / 2 - 0.05 - upperDoorHeight / 2, "upper");
  } else if (specialty.kind === "diagonal-corner") {
    // Match the 2D diagonal corner: a square corner body with two center-meeting
    // doors on the actual 45-degree clipped front—not in the center plane of the
    // square body. Keeping these faces on the diagonal is particularly important
    // for LS3612: a centered pair makes a correct 36×36 Lazy Susan look like an
    // ordinary rectangular base from the mobile orbit camera.
    const diagonalWidth = angledWallProfile
      ? triangleCornerFrontWidth(bodyWidth, bodyDepth)
      : diagonalCornerFrontWidth(bodyWidth, bodyDepth);
    const diagonalDoorCount = angledWallProfile
      ? 1
      : sku.numberOfDoors != null && sku.numberOfDoors > 0
        ? Math.min(2, Math.max(1, Math.round(sku.numberOfDoors)))
        : 2;
    const diagonalDoorWidth = diagonalWidth / diagonalDoorCount;
    const diagonalDoorHeight = Math.max(0.2, bodyHeight - 0.1);
    const angledWallFace = angledWallProfile ? triangleCornerFrontPose(bodyWidth, bodyDepth) : null;
    const diagonalFaceCenterX = angledWallFace?.x ?? bodyWidth / 4;
    const diagonalFaceCenterZ = angledWallFace?.z ?? bodyDepth / 4;
    const diagonalFaceNormal = angledWallProfile ? 0 : Math.SQRT1_2 * 0.045;
    const tangentOffset = diagonalDoorWidth / 2;
    const directions = diagonalDoorCount === 1 ? [0] : [-1, 1];
    for (const direction of directions) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(diagonalDoorWidth - 0.03, diagonalDoorHeight, 0.052), faceMaterial);
      door.position.set(
        diagonalFaceCenterX + direction * Math.SQRT1_2 * tangentOffset + diagonalFaceNormal,
        0,
        diagonalFaceCenterZ - direction * Math.SQRT1_2 * tangentOffset + diagonalFaceNormal,
      );
      door.rotation.y = angledWallFace?.rotation ?? Math.PI / 4;
      door.userData = angledWallProfile
        ? { specialtyProfile: "angled-wall", angledWallDoor: true, flushPhysicalFace: true, cabinetFront: true }
        : { specialtyProfile: "diagonal-corner", diagonalDoor: direction === -1 ? "left" : "right", cabinetFront: true, flushPhysicalFace: true };
      frontGroup.add(door);
      addShakerFrame(
        diagonalDoorWidth - 0.03,
        diagonalDoorHeight,
        door.position.x + (angledWallFace?.normalX ?? 0) * 0.034,
        door.position.y,
        door.position.z + (angledWallFace?.normalZ ?? 1) * 0.034,
        door.rotation.y,
      );
      if (diagonalDoorCount === 1) {
        const pullLength = Math.min(Math.max(0.12, diagonalDoorHeight * 0.28), 0.86);
        const normalX = Math.sin(door.rotation.y);
        const normalZ = Math.cos(door.rotation.y);
        const hardwarePosition = normalizeDoorHardwareFramePosition(sku.hardwarePosition ?? sku.handleSide ?? "auto");
        const handleSide = hardwarePosition === "left" ? -1 : hardwarePosition === "right" ? 1 : sku.swing === "right" ? -1 : 1;
        const faceWidth = diagonalDoorWidth - 0.03;
        const pullOffset = doorHardwareOffsetFromFaceCenterIn(
          faceWidth / INCH,
          handleSide < 0 ? "left" : handleSide > 0 ? "right" : "center",
        ) * INCH;
        const tangentX = Math.cos(door.rotation.y);
        const tangentZ = -Math.sin(door.rotation.y);
        const pull = new THREE.Mesh(new THREE.BoxGeometry(0.022, pullLength, 0.026), hardwareMaterial);
        pull.position.set(
          door.position.x + tangentX * pullOffset + normalX * 0.058,
          door.position.y - diagonalDoorHeight * 0.3,
          door.position.z + tangentZ * pullOffset + normalZ * 0.058,
        );
        pull.rotation.y = door.rotation.y;
        pull.userData = { cabinetHardware: true, cabinetPull: "door", diagonalDoorPull: true, verticalPull: true, pullEdge: hardwarePosition === "auto" || hardwarePosition === "paired" ? "opposite-hinge" : hardwarePosition, hingeSide: singleDoorHinge, handleSide: hardwarePosition === "auto" || hardwarePosition === "paired" ? singleDoorHinge === "left" ? "right" : "left" : hardwarePosition, hardwarePosition, frameWidthIn: 3, frameCenterInsetIn: FRAMED_STILE_CENTER_IN, dimensionalCabinetDetail: true };
        frontGroup.add(pull);
        for (const offset of [-1, 1] as const) {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 10), hardwareMaterial);
          stem.rotation.set(Math.PI / 2, door.rotation.y, 0);
          stem.position.set(pull.position.x, pull.position.y + offset * pullLength * 0.34, pull.position.z - 0.018);
          stem.userData = { cabinetHardwareMount: true, diagonalDoorPullMount: true };
          frontGroup.add(stem);
        }
      }
    }
  } else if (specialty.kind === "triangle-corner") {
    // A WTC/BTC and the AW1230 angled-wall profile use the true triangular
    // hypotenuse: its full diagonal is the angled
    // front, not the shorter clipped face used by a diagonal wall corner.
    const triangleWidth = triangleCornerFrontWidth(bodyWidth, bodyDepth);
    const triangleDoorWidth = triangleWidth / 2;
    const triangleDoorHeight = Math.max(0.2, bodyHeight - 0.1);
    const triangleFace = triangleCornerFrontPose(bodyWidth, bodyDepth);
    const tangentOffset = triangleDoorWidth / 2;
    for (const direction of [-1, 1] as const) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(triangleDoorWidth - 0.03, triangleDoorHeight, 0.052), faceMaterial);
      door.position.set(
        triangleFace.x + direction * Math.SQRT1_2 * tangentOffset,
        0,
        triangleFace.z + direction * Math.SQRT1_2 * tangentOffset,
      );
      door.rotation.y = triangleFace.rotation;
      door.userData = { specialtyProfile: "triangle-corner", triangleDoor: direction === -1 ? "left" : "right", cabinetFront: true, flushPhysicalFace: true };
      frontGroup.add(door);
      addShakerFrame(
        triangleDoorWidth - 0.03,
        triangleDoorHeight,
        door.position.x + triangleFace.normalX * 0.034,
        door.position.y,
        door.position.z + triangleFace.normalZ * 0.034,
        door.rotation.y,
      );
    }
  } else if (specialty.kind === "l-corner") {
    // Preserve the restored 2D Lazy Susan L-outline: each door sits on one
    // exposed 12-inch leg, rather than introducing a diagonal front in 3D.
    const lShape = lCornerCarcassParts(bodyWidth, bodyDepth, lCornerLegRatio);
    const faceHeight = Math.max(0.2, bodyHeight - 0.1);
    const exposedFrontWidth = Math.max(0.2, bodyWidth - lShape.sideLeg.width);
    const backFrontZ = lShape.backLeg.z + lShape.backLeg.depth / 2 + 0.03;
    const backDoor = new THREE.Mesh(new THREE.BoxGeometry(exposedFrontWidth - 0.09, faceHeight, 0.052), faceMaterial);
    backDoor.position.set(bodyWidth / 2 - exposedFrontWidth / 2, 0, backFrontZ);
    backDoor.userData = { specialtyProfile: "l-corner", lCornerDoor: "back-leg", cabinetFront: true, flushPhysicalFace: true };
    frontGroup.add(backDoor);
    addShakerFrame(exposedFrontWidth - 0.09, faceHeight, backDoor.position.x, backDoor.position.y, backDoor.position.z + 0.034);

    const sideFrontX = lShape.sideLeg.x + lShape.sideLeg.width / 2 + 0.03;
    const sideDoor = new THREE.Mesh(new THREE.BoxGeometry(lShape.sideLeg.depth - 0.09, faceHeight, 0.052), faceMaterial);
    sideDoor.position.set(sideFrontX, 0, lShape.sideLeg.z);
    sideDoor.rotation.y = Math.PI / 2;
    sideDoor.userData = { specialtyProfile: "l-corner", lCornerDoor: "side-leg", cabinetFront: true, flushPhysicalFace: true };
    frontGroup.add(sideDoor);
    addShakerFrame(lShape.sideLeg.depth - 0.09, faceHeight, sideDoor.position.x + 0.034, sideDoor.position.y, sideDoor.position.z, sideDoor.rotation.y);

    // LSB/ERB/BER base corners retain their two physical face planes while the
    // selected swing designates the operative opening edge. Place one pull on
    // that room-facing door, laterally opposite its hinge.
    const code = sku.masterCode.toUpperCase();
    const hingeSelectableCornerBase = placement === "base" && (/^(?:LSB?|ERB|BER)[-_]?\d/.test(code) || /lazy\s*susan|easy\s*reach/i.test(sku.description ?? ""));
    if (hingeSelectableCornerBase) {
      const hingeSide = sku.swing === "right" ? "right" as const : "left" as const;
      const hardwarePosition = normalizeDoorHardwareFramePosition(sku.hardwarePosition ?? sku.handleSide ?? "auto");
      const pullLength = Math.min(Math.max(0.12, faceHeight * 0.28), 0.86);
      // Base lazy-Susan pulls sit at the upper opening edge of their operative
      // door, unlike the lower-centered pull used on ordinary base doors.
      const upperOpeningPullY = faceHeight / 2 - pullLength / 2 - 0.08;
      const targets = hardwarePosition === "paired"
        ? [backDoor, sideDoor]
        : [hingeSide === "left" ? backDoor : sideDoor];
      for (const targetDoor of targets) {
        const targetWidth = targetDoor === backDoor ? exposedFrontWidth - 0.09 : lShape.sideLeg.depth - 0.09;
        const automaticSide = targetDoor === backDoor ? 1 : -1;
        const offset = hardwarePosition === "left" ? -1 : hardwarePosition === "right" ? 1 : automaticSide;
        const pullOffset = doorHardwareOffsetFromFaceCenterIn(
          targetWidth / INCH,
          offset < 0 ? "left" : offset > 0 ? "right" : "center",
        ) * INCH;
        const pull = new THREE.Mesh(new THREE.BoxGeometry(0.022, pullLength, 0.026), hardwareMaterial);
        if (targetDoor === backDoor) {
          pull.position.set(backDoor.position.x + pullOffset, upperOpeningPullY, backDoor.position.z + 0.066);
        } else {
          pull.position.set(sideDoor.position.x + 0.066, upperOpeningPullY, sideDoor.position.z - pullOffset);
          pull.rotation.y = Math.PI / 2;
        }
        pull.userData = { cabinetHardware: true, cabinetPull: "door", lCornerHingeOppositePull: hardwarePosition === "auto" || hardwarePosition === "paired", verticalPull: true, pullEdge: hardwarePosition === "auto" || hardwarePosition === "paired" ? "opposite-hinge" : hardwarePosition, pullHeight: "upper-opening-edge", hingeSide, handleSide: hardwarePosition === "auto" || hardwarePosition === "paired" ? hingeSide === "left" ? "right" : "left" : hardwarePosition, hardwarePosition, frameWidthIn: 3, frameCenterInsetIn: FRAMED_STILE_CENTER_IN, dimensionalCabinetDetail: true };
        frontGroup.add(pull);
      }
    }
  } else if (specialty.kind === "corner-drawer") {
    // CDB36 retains its 36-by-36 plan footprint while its front exactly follows
    // the 2D Corner Drawer Base elevation: an 8% corner marker and a full-height
    // 92% stack of measured drawer rows—not a 24-inch blank panel plus a strip.
    const { cornerMarkerWidth, drawerStackWidth } = cornerDrawerFrontLayout(bodyWidth);
    const cornerMarker = new THREE.Mesh(
      new THREE.BoxGeometry(cornerMarkerWidth - 0.01, bodyHeight - 0.08, 0.045),
      trimMaterial,
    );
    cornerMarker.position.set(-bodyWidth / 2 + cornerMarkerWidth / 2 + 0.01, 0, 0.03);
    cornerMarker.userData = { specialtyProfile: "corner-drawer", cornerDrawerIndicator: true };
    frontGroup.add(cornerMarker);
    const rows = resolvedThreeDDrawerRows(sku, bodyHeight - 0.1, Math.max(1, drawerCount || 3));
    let rowTop = bodyHeight / 2 - 0.05;
    for (const row of rows) {
      const drawerWidth = drawerStackWidth / row.count;
      for (let column = 0; column < row.count; column++) {
        const drawer = new THREE.Mesh(new THREE.BoxGeometry(drawerWidth - 0.025, Math.max(0.08, row.height - 0.025), 0.052), faceMaterial);
        drawer.position.set(-bodyWidth / 2 + cornerMarkerWidth + drawerWidth * (column + 0.5), rowTop - row.height / 2, 0.035);
        drawer.userData = { specialtyProfile: "corner-drawer", cornerDrawerFace: true, cabinetFront: true, cabinetDrawerFront: true, flushPhysicalFace: true };
        frontGroup.add(drawer);
        addDrawerReveal(drawerWidth - 0.025, Math.max(0.08, row.height - 0.025), drawer.position.x, drawer.position.y);
        addShakerFrame(drawerWidth - 0.025, Math.max(0.08, row.height - 0.025), drawer.position.x, drawer.position.y, 0.066);
      }
      rowTop -= row.height;
    }
  } else if (specialty.kind === "end-return") {
    // BEC / BA has two full-height door planes fixed directly to the two
    // perpendicular exterior sides of the 24×24 body.
    const attachedFronts = baseEndAttachedFrontLayout(bodyWidth, bodyDepth);
    const faceHeight = Math.max(0.2, bodyHeight - 0.1);
    for (const face of attachedFronts.faces) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(attachedFronts.doorWidth, faceHeight, 0.05), faceMaterial);
      door.position.set(face.x, 0, face.z);
      door.rotation.y = face.rotation;
      door.userData = {
        specialtyProfile: "end-return",
        nonCornerEndReturnDoor: face.side,
        attachedEndFront: true,
        doorWidthIn: attachedFronts.doorWidth / INCH,
        referenceFaceSideIn: attachedFronts.sideLength / INCH,
        sharedExteriorApex: attachedFronts.apex,
        exteriorFaceRotation: face.rotation,
        flushPhysicalFace: true,
        cabinetFront: true,
      };
      frontGroup.add(door);
      const frameNormalX = Math.sin(door.rotation.y) * 0.031;
      const frameNormalZ = Math.cos(door.rotation.y) * 0.031;
      addShakerFrame(attachedFronts.doorWidth - 0.03, faceHeight, door.position.x + frameNormalX, door.position.y, door.position.z + frameNormalZ, door.rotation.y);
    }
  } else if (specialty.kind === "farmhouse-sink") {
    // FSB farmhouse bases carry their apron on the positive-Z local face. The
    // cabinet's resolved wall transform keeps that feature facing the room.
    const apronWidth = Math.max(0.3, bodyWidth * 0.68);
    const apronHeight = Math.max(0.22, bodyHeight * 0.56);
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(apronWidth, apronHeight, 0.066),
      new THREE.MeshStandardMaterial({ color: "#ece9e1", roughness: 0.34, metalness: 0.04 }),
    );
    apron.position.set(0, -bodyHeight * 0.1, 0.038);
    apron.userData = { specialtyProfile: "farmhouse-sink", farmhouseApronFront: true, cabinetFront: true };
    frontGroup.add(apron);
    const basinMaterial = new THREE.MeshStandardMaterial({ color: "#d5d8d9", roughness: 0.22, metalness: 0.62 });
    const basin = new THREE.Mesh(new THREE.BoxGeometry(apronWidth * 0.82, 0.055, Math.max(0.22, bodyDepth * 0.46)), basinMaterial);
    basin.position.set(0, bodyHeight / 2 + 0.016, bodyDepth * 0.08);
    basin.userData = { specialtyProfile: "farmhouse-sink", farmhouseSinkBasin: true, dimensionalApplianceDetail: true };
    cabinet.add(basin);
    const faucetMaterial = new THREE.MeshStandardMaterial({ color: "#9fa5aa", roughness: 0.16, metalness: 0.88 });
    const faucetPost = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, bodyHeight * 0.16, 14), faucetMaterial);
    faucetPost.position.set(0, bodyHeight / 2 + bodyHeight * 0.08, -bodyDepth * 0.12);
    faucetPost.userData = { specialtyProfile: "farmhouse-sink", farmhouseSinkFaucetPost: true, dimensionalApplianceDetail: true };
    cabinet.add(faucetPost);
    const faucetSpout = new THREE.Mesh(new THREE.TorusGeometry(bodyDepth * 0.11, 0.018, 8, 18, Math.PI), faucetMaterial);
    faucetSpout.rotation.x = Math.PI / 2;
    faucetSpout.position.set(0, bodyHeight / 2 + bodyHeight * 0.15, -bodyDepth * 0.015);
    faucetSpout.userData = { specialtyProfile: "farmhouse-sink", farmhouseSinkFaucetSpout: true, dimensionalApplianceDetail: true };
    cabinet.add(faucetSpout);
    const falseFrontHeight = Math.max(0.1, bodyHeight * 0.18);
    const falseFront = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth - 0.08, falseFrontHeight, 0.048), faceMaterial);
    falseFront.position.set(0, bodyHeight / 2 - falseFrontHeight / 2 - 0.04, 0.028);
    falseFront.userData = { specialtyProfile: "farmhouse-sink", farmhouseFalseFront: true, cabinetFront: true };
    frontGroup.add(falseFront);
    addShakerFrame(bodyWidth - 0.08, falseFrontHeight, falseFront.position.x, falseFront.position.y, 0.062);
    const sideDoorWidth = Math.max(0.1, (bodyWidth - apronWidth - 0.12) / 2);
    for (const side of [-1, 1] as const) {
      const sideDoor = new THREE.Mesh(new THREE.BoxGeometry(sideDoorWidth, apronHeight, 0.052), faceMaterial);
      sideDoor.position.set(side * (apronWidth + sideDoorWidth) / 2, apron.position.y, 0.032);
      sideDoor.userData = { specialtyProfile: "farmhouse-sink", farmhouseSideDoor: side === -1 ? "left" : "right", cabinetFront: true };
      frontGroup.add(sideDoor);
      addShakerFrame(sideDoorWidth, apronHeight, sideDoor.position.x, sideDoor.position.y, 0.066);
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
  const vanityFaceLayout = resolvedThreeDVanityFaceLayout(sku.layoutSpec);
  if (vanityFaceLayout) {
    const availableWidth = bodyWidth - 0.08;
    const drawerBankWidth = availableWidth * vanityFaceLayout.drawerBankRatio;
    const doorWidth = availableWidth - drawerBankWidth;
    const drawerX = vanityFaceLayout.drawerSide === 'left'
      ? -bodyWidth / 2 + 0.04 + drawerBankWidth / 2
      : bodyWidth / 2 - 0.04 - drawerBankWidth / 2;
    const doorX = vanityFaceLayout.drawerSide === 'left'
      ? bodyWidth / 2 - 0.04 - doorWidth / 2
      : -bodyWidth / 2 + 0.04 + doorWidth / 2;
    const faceHeight = bodyHeight - 0.08;
    const drawerHeight = faceHeight / vanityFaceLayout.drawerCount;
    for (let index = 0; index < vanityFaceLayout.drawerCount; index++) {
      const drawer = new THREE.Mesh(new THREE.BoxGeometry(drawerBankWidth - 0.025, drawerHeight - 0.025, 0.048), faceMaterial);
      drawer.position.set(drawerX, bodyHeight / 2 - 0.04 - drawerHeight * (index + 0.5), 0.004);
      drawer.userData = { cabinetFront: true, cabinetDrawerFront: true, vanityDrawerFront: true, drawerSide: vanityFaceLayout.drawerSide, flushPhysicalFace: true };
      frontGroup.add(drawer);
      addDrawerReveal(drawerBankWidth - 0.025, drawerHeight - 0.025, drawer.position.x, drawer.position.y);
      addShakerFrame(drawerBankWidth - 0.025, drawerHeight - 0.025, drawer.position.x, drawer.position.y);
      addFaceShadow(drawerBankWidth - 0.025, drawerHeight - 0.025, drawer.position.x, drawer.position.y);
      addPull(drawerBankWidth - 0.025, drawerHeight - 0.025, drawer.position.x, drawer.position.y, true);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.03, faceHeight, 0.045), faceMaterial);
    door.position.set(doorX, 0, 0);
    door.userData = { cabinetFront: true, vanityDoorFront: true, drawerSide: vanityFaceLayout.drawerSide, flushPhysicalFace: true };
    frontGroup.add(door);
    if (profileKind === 'shaker') addShakerFrame(doorWidth - 0.03, faceHeight, door.position.x, door.position.y);
    addFaceShadow(doorWidth - 0.03, faceHeight, door.position.x, door.position.y);
    addPull(doorWidth - 0.03, faceHeight, door.position.x, door.position.y, false, 0.086, "lower", singleDoorHinge);
  } else {
  for (let i = 0; i < doorCount; i++) {
    const doorWidth = (bodyWidth - 0.08) / doorCount;
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.03, doorHeight, 0.045), faceMaterial);
    door.position.set(
      -bodyWidth / 2 + 0.04 + doorWidth * (i + 0.5),
      wd18Layout ? bodyHeight / 2 - 0.04 - doorHeight / 2 : -bodyHeight / 2 + 0.04 + doorHeight / 2,
      0,
    );
    door.userData = { cabinetFront: true, flushPhysicalFace: true, ...(wd18Layout ? { wd18UpperDoor: true } : {}) };
    frontGroup.add(door);
    addFaceShadow(doorWidth - 0.03, doorHeight, door.position.x, door.position.y);
    addPull(doorWidth - 0.03, doorHeight, door.position.x, door.position.y, false, 0.086, placement === "wall" ? "upper" : "lower", doorCount === 1 ? singleDoorHinge : null);
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
  const drawerRows = wd18Layout
    ? wd18Layout.drawerHeights.map((heightIn) => ({ count: 1, height: heightIn * INCH }))
    : resolvedThreeDDrawerRows(
      sku,
      drawerHeight,
      drawerCount,
      placement === "base" && doorCount === 0 && drawerCount > 1,
    );
  const drawersAtBottom = hasConfiguredOpening || Boolean(wd18Layout);
  let drawerCursor = drawersAtBottom ? -bodyHeight / 2 + 0.04 : bodyHeight / 2 - 0.04;
  for (const row of drawerRows) {
    const rowHeight = Math.max(0.08, row.height - 0.025);
    const drawerWidth = (bodyWidth - 0.08) / row.count;
    for (let column = 0; column < row.count; column++) {
      const drawer = new THREE.Mesh(new THREE.BoxGeometry(drawerWidth - 0.025, rowHeight, 0.048), faceMaterial);
      const rowY = drawersAtBottom ? drawerCursor + row.height / 2 : drawerCursor - row.height / 2;
      drawer.position.set(-bodyWidth / 2 + 0.04 + drawerWidth * (column + 0.5), rowY, 0.004);
      drawer.userData = { cabinetFront: true, cabinetDrawerFront: true, ...(isStandardSinkBase ? { falseDrawerFront: true } : {}), ...(wd18Layout ? { wd18BottomDrawer: true } : {}), flushPhysicalFace: true };
      frontGroup.add(drawer);
      addDrawerReveal(drawerWidth - 0.025, rowHeight, drawer.position.x, drawer.position.y);
      addShakerFrame(drawerWidth - 0.025, rowHeight, drawer.position.x, drawer.position.y);
      addFaceShadow(drawerWidth - 0.025, rowHeight, drawer.position.x, drawer.position.y);
      // A standard sink base may have a shallow false front above its doors,
      // but that face is not an operable drawer and must not receive a
      // horizontal handle. Its vertical door pulls remain unchanged above.
      if (!isStandardSinkBase) addPull(drawerWidth - 0.025, rowHeight, drawer.position.x, drawer.position.y, true);
    }
    drawerCursor += drawersAtBottom ? row.height : -row.height;
  }
  if (hasConfiguredOpening && doorCount === 0) {
    const availableOpeningWidth = Math.max(0.2, bodyWidth - 0.11);
    const availableOpeningHeight = Math.max(0.2, usableHeight - drawerHeight);
    // Cabinet Config is authoritative: a built-in appliance/opening can be
    // smaller than the surrounding box, never wider or taller than its explicit
    // opening envelope (for example, a 27-by-17 microwave bay).
    const openingWidth = Math.min(
      availableOpeningWidth,
      sku.openingWidth != null ? Math.max(0.2, numberValue(sku.openingWidth, availableOpeningWidth / INCH) * INCH) : availableOpeningWidth,
    );
    const openingHeight = Math.min(
      availableOpeningHeight,
      sku.openingHeight != null ? Math.max(0.2, numberValue(sku.openingHeight, availableOpeningHeight / INCH) * INCH) : availableOpeningHeight,
    );
    const opening = new THREE.Mesh(
      new THREE.BoxGeometry(openingWidth, openingHeight - 0.03, 0.052),
      new THREE.MeshStandardMaterial({ color: "#343a43", roughness: 0.5, metalness: 0.2 }),
    );
    opening.position.set(0, bodyHeight / 2 - 0.04 - openingHeight / 2, 0.006);
    opening.userData = {
      configuredOpening: true,
      openingType: sku.openingType,
      openingWidthIn: openingWidth / INCH,
      openingHeightIn: openingHeight / INCH,
    };
    frontGroup.add(opening);
  }
  }
  }
  cabinet.add(frontGroup);
  for (const bodyMesh of bodyMeshes) {
    // The L corner is built from two overlapping carcass legs. Their individual
    // edge overlays expose the internal construction seam as a false line that
    // projects into the room. The two door frames remain the visible seam.
    if (specialty.kind === "l-corner" || specialty.kind === "end-return") continue;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(bodyMesh.geometry),
      new THREE.LineBasicMaterial({ color: "#332d25", transparent: true, opacity: 0.34 }),
    );
    edges.position.copy(bodyMesh.position);
    cabinet.add(edges);
  }
  const placementIdentity: ThreeDCabinetHit = {
    uid: sku.placementUid ?? null,
    masterCode: sku.masterCode,
    description: sku.description ?? null,
    distributorSkuId: sku.distributorSkuId,
  };
  applyThreeDPlacementIdentity(cabinet, placementIdentity);
  root.add(cabinet);

  if (shouldRenderCountertopOverSceneItem(placement, sku.masterCode, sku.description)) {
    const counterMaterial = new THREE.MeshStandardMaterial({ color: counterColor, roughness: 0.33, metalness: 0.03 });
    if (specialty.kind === "corner-drawer" || specialty.kind === "l-corner") {
      const counterGroup = new THREE.Group();
      counterGroup.position.set(cabinet.position.x, countertopCenterY, cabinet.position.z);
      counterGroup.rotation.y = rotation;
      for (const part of Object.values(lCornerCarcassParts(bodyWidth, bodyDepth, lCornerLegRatio)).filter((value): value is { width: number; depth: number; x: number; z: number } => typeof value === "object" && value !== null && "width" in value)) {
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(part.width, 1.5 * INCH, threeDCountertopDepthIn(part.depth / INCH) * INCH),
          counterMaterial,
        );
        slab.position.set(part.x, 0, part.z + COUNTERTOP_FRONT_OVERHANG / 2);
        slab.userData = { specialtyProfile: specialty.kind, lCornerCountertop: true };
        counterGroup.add(slab);
      }
      applyThreeDPlacementIdentity(counterGroup, placementIdentity);
      root.add(counterGroup);
    } else if (specialty.kind === "end-return") {
      const diagram = baseEndAttachedFrontLayout(bodyWidth, bodyDepth);
      const countertopSideLength = threeDCountertopDepthIn(diagram.sideLength / INCH) * INCH;
      const counter = new THREE.Mesh(
        baseEndDiagramGeometry(countertopSideLength, 1.5 * INCH),
        counterMaterial,
      );
      counter.position.copy(cabinet.position);
      counter.rotation.y = rotation;
      counter.position.y = countertopCenterY;
      counter.userData = {
        countertopDepthIn: threeDCountertopDepthIn(bodyDepth / INCH),
        endReturnCountertop: true,
        nonCornerEndReturnCountertop: true,
        diagramDefinedRearApexCountertop: true,
      };
      applyThreeDPlacementIdentity(counter, placementIdentity);
      root.add(counter);
    } else if (specialty.kind === "diagonal-corner") {
      const counter = new THREE.Mesh(
        diagonalCornerWedgeGeometry(bodyWidth + 0.12, bodyDepth + 0.12, 1.5 * INCH),
        counterMaterial,
      );
      counter.position.copy(cabinet.position);
      counter.rotation.y = rotation;
      counter.position.y = countertopCenterY;
      counter.userData = { diagonalCornerCountertop: true };
      applyThreeDPlacementIdentity(counter, placementIdentity);
      root.add(counter);
    } else if (specialty.kind === "triangle-corner") {
      const counter = new THREE.Mesh(
        triangleCornerWedgeGeometry(bodyWidth + 0.12, bodyDepth + 0.12, 1.5 * INCH),
        counterMaterial,
      );
      counter.position.copy(cabinet.position);
      counter.rotation.y = rotation;
      counter.position.y = countertopCenterY;
      counter.userData = { triangleCornerCountertop: true };
      applyThreeDPlacementIdentity(counter, placementIdentity);
      root.add(counter);
    } else {
      const counter = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth, 1.5 * INCH, threeDCountertopDepthIn(bodyDepth / INCH) * INCH), counterMaterial);
      counter.position.copy(cabinet.position);
      counter.rotation.y = rotation;
      counter.translateZ(COUNTERTOP_FRONT_OVERHANG / 2);
      counter.position.y = countertopCenterY;
      counter.userData = { countertopDepthIn: threeDCountertopDepthIn(bodyDepth / INCH) };
      if (specialty.kind === "blind-corner") counter.userData = { ...counter.userData, blindCornerCountertop: true };
      if (isFloorDishwasher) counter.userData = { ...counter.userData, dishwasherCountertopSupport: true, floorApplianceSupport: true };
      applyThreeDPlacementIdentity(counter, placementIdentity);
      root.add(counter);
    }
  }
}

export type ThreeDPlacedWall = "back" | "front" | "left" | "right";

/** Resolves the room wall that owns a rectangular placed item from its 2D footprint. */
export function threeDPlacedWall(
  cabinet: PlacedCabinet,
  room: Pick<RoomData, "width" | "depth">,
  toleranceIn = 1.5,
): ThreeDPlacedWall | null {
  const footprint = normalizedThreeDFootprint(cabinet);
  const distances: Array<{ wall: ThreeDPlacedWall; distance: number }> = [
    { wall: "back", distance: Math.abs(cabinet.y) },
    { wall: "front", distance: Math.abs(room.depth - (cabinet.y + footprint.d)) },
    { wall: "left", distance: Math.abs(cabinet.x) },
    { wall: "right", distance: Math.abs(room.width - (cabinet.x + footprint.w)) },
  ];
  const nearest = distances.reduce((closest, candidate) => candidate.distance < closest.distance ? candidate : closest);
  // Interior/island cabinets retain their explicit user rotation. Only an item
  // seated at a room boundary has an unambiguous wall-facing direction.
  return nearest.distance <= toleranceIn ? nearest.wall : null;
}

/**
 * Legacy base and wall runs retain their 2D quarter-turn even when their saved
 * perpendicular offset is too large for a strict proximity match. Use that
 * intended wall only when it agrees with the nearest physical wall.
 */
export function threeDLegacyWallAnchor(
  cabinet: PlacedCabinet,
  room: Pick<RoomData, "width" | "depth">,
): ThreeDPlacedWall | null {
  const footprint = normalizedThreeDFootprint(cabinet);
  const distances: Array<{ wall: ThreeDPlacedWall; distance: number }> = [
    { wall: "back", distance: Math.abs(cabinet.y) },
    { wall: "front", distance: Math.abs(room.depth - (cabinet.y + footprint.d)) },
    { wall: "left", distance: Math.abs(cabinet.x) },
    { wall: "right", distance: Math.abs(room.width - (cabinet.x + footprint.w)) },
  ];
  const nearest = distances.reduce((closest, candidate) => candidate.distance < closest.distance ? candidate : closest);
  const quarterTurn = ((Math.round(Number(cabinet.rotation) / 90) % 4) + 4) % 4;
  const rotatedWall: ThreeDPlacedWall = ["back", "left", "front", "right"][quarterTurn] as ThreeDPlacedWall;
  if (nearest.distance <= 18 && nearest.wall === rotatedWall) return rotatedWall;
  return threeDPlacedWall(cabinet, room, 6);
}

/**
 * Local fronts are modeled on positive Z. Convert each 2D room-wall placement
 * to a world rotation that points those fronts into usable room space while the
 * cabinet/appliance back remains against the wall.
 */
export function threeDRoomFacingRotation(
  cabinet: PlacedCabinet,
  room?: (Pick<RoomData, "ceilingHeight"> & Partial<Pick<RoomData, "width" | "depth">>) | null,
  fallbackRotation = 0,
) {
  if (!room || !Number.isFinite(room.width) || !Number.isFinite(room.depth)) return fallbackRotation;
  const kind = placedCornerGeometryKind(cabinet);
  const code = `${cabinet.masterCode ?? ""}`.replace(/[^a-z0-9]/gi, "").toUpperCase();
  // L-corner carcasses use a local notch/front convention opposite the clockwise
  // 2D corner turn. Mirror that turn so both Lazy Susan and easy-reach fronts
  // face the room at left- and right-hand corners, while their backs stay at the
  // two adjoining walls.
  if (kind === "l-shape" && /^(?:LSB?|ERB|BER)\d/.test(code)) return (-fallbackRotation + Math.PI * 2) % (Math.PI * 2);
  if (kind !== "standard") return fallbackRotation;
  const facing: Record<ThreeDPlacedWall, number> = {
    back: 0,
    front: Math.PI,
    left: Math.PI / 2,
    right: -Math.PI / 2,
  };
  const resolvedRoom = room as Pick<RoomData, "width" | "depth">;
  const defaultWall = threeDPlacedWall(cabinet, resolvedRoom);
  // FSB36 can touch two walls at a run end. In that tie the 2D quarter turn
  // determines its intended run: 90°/270° = left/right wall, 0°/180° = back/front.
  const savedQuarterTurn = ((Number(cabinet.rotation) % 360) + 360) % 360;
  const isFarmhouseSink = /^(?:ADA)?FSB\d/.test(code);
  const footprint = normalizedThreeDFootprint(cabinet);
  const sideWall = Math.abs(cabinet.x) <= Math.abs(resolvedRoom.width - (cabinet.x + footprint.w)) ? "left" : "right";
  const horizontalWall = Math.abs(cabinet.y) <= Math.abs(resolvedRoom.depth - (cabinet.y + footprint.d)) ? "back" : "front";
  const wall = isFarmhouseSink
    ? (savedQuarterTurn === 90 || savedQuarterTurn === 270 ? sideWall : horizontalWall)
    : defaultWall;
  return wall ? facing[wall] : fallbackRotation;
}

/**
 * The local diagonal-corner face is authored for the back-left corner. Three.js
 * group rotation has the opposite handedness from the 2D corner-turn value, so
 * mirror the turn to point the diagonal doors into the room at every corner.
 */
export function diagonalCornerRoomRotation(cornerTurn: number): number {
  const normalized = ((cornerTurn % 360) + 360) % 360;
  return (360 - normalized) % 360;
}

export function existingCabinetTransform(
  cabinet: PlacedCabinet,
  room?: (Pick<RoomData, "ceilingHeight"> & Partial<Pick<RoomData, "width" | "depth">>) | null,
) {
  // Placed coordinates are the top-left of the 2D rotation-aware footprint.
  // Using nominal width/depth here offsets rotated runs by up to half a cabinet,
  // producing artificial gaps in the 3D scene.
  const footprint = normalizedThreeDFootprint(cabinet);
  const width = numberValue(footprint.w, 24);
  const depth = numberValue(footprint.d, BASE_DEPTH);
  const savedRotation = Number(cabinet.rotation);
  const sharedKind = placedCornerGeometryKind(cabinet);
  const hasPlacedRoom = Number.isFinite(room?.width) && Number.isFinite(room?.depth);
  const cornerTurn = hasPlacedRoom && (sharedKind === "diagonal" || sharedKind === "triangle" || sharedKind === "l-shape" || sharedKind === "corner-drawer")
    ? cornerRotationForPlaced(cabinet, room as RoomData)
    : null;
  const planRotation = sharedKind === "diagonal" && cornerTurn != null
    ? diagonalCornerRoomRotation(cornerTurn)
    : cornerTurn ?? savedRotation;
  // 2D horizontal walls share a 0° rotation and vertical walls share 90°, which
  // is sufficient for a plan footprint but cannot distinguish back/front or
  // left/right in a 3D room. Resolve orientation from the placed wall so every
  // front projects into the room and every back sits against its wall.
  const savedRotationRadians = Number.isFinite(planRotation) ? planRotation * Math.PI / 180 : 0;
  const rotation = threeDRoomFacingRotation(cabinet, room, savedRotationRadians);
  const sharedElevation = elevationBox(cabinet, room);
  const explicitMountBottom = cabinet.mountBottom == null ? null : numberValue(cabinet.mountBottom, 0);
  const bottom = cabinet.placement === "wall" || cabinet.placement === "appliance" || explicitMountBottom != null
    ? explicitMountBottom ?? sharedElevation.bottom
    : cabinet.placement === "baseTop"
      ? STD.BASE_HEIGHT - numberValue(cabinet.height, 6)
      : cabinet.placement === "underCabinet"
        ? WALL_BOTTOM - numberValue(cabinet.height, 6)
        : 0;
  let x = cabinet.x + width / 2;
  let z = cabinet.y + depth / 2;
  // Older saved designs sometimes carry a small perpendicular gap even though
  // their end-run cabinet is intended to sit on the closest wall. Keep explicit
  // Move In/Move Out adjustments intact, but seat legacy end runs flush so their
  // backs do not float inside the room.
  const legacyWall = hasPlacedRoom
    && !cabinet.depthPositionAdjusted
    && (cabinet.placement === "base" || cabinet.placement === "wall")
    ? threeDLegacyWallAnchor(cabinet, room as Pick<RoomData, "width" | "depth">)
    : null;
  if (legacyWall === "left") x = width / 2;
  if (legacyWall === "right") x = (room as Pick<RoomData, "width">).width - width / 2;
  if (legacyWall === "back") z = depth / 2;
  if (legacyWall === "front") z = (room as Pick<RoomData, "depth">).depth - depth / 2;
  return { x, z, rotation, bottom };
}

/**
 * A hood must share the range center along its wall axis. Older plans can retain
 * a small manual x/y nudge from drag placement; preserving that offset makes the
 * hood float beside its cooktop in 3D even though both records represent one
 * range zone in the 2D plan.
 */
export function savedRangeHoodTransform(
  hood: PlacedCabinet,
  placed: PlacedCabinet[],
  room: RoomData,
) {
  const transform = existingCabinetTransform(hood, room);
  if (!/^HOOD[-_]?/i.test(hood.masterCode ?? "")) return transform;
  if (hood.rangeHoodPositionAdjusted) return transform;
  const hoodRotation = ((Number(hood.rotation) % 360) + 360) % 360;
  const range = placed.find((item) => {
    if (!/^RANGE[-_]?/i.test(item.masterCode ?? "")) return false;
    const rangeRotation = ((Number(item.rotation) % 360) + 360) % 360;
    return rangeRotation === hoodRotation;
  });
  if (!range) return transform;
  const rangeTransform = existingCabinetTransform(range, room);
  // A 90°/270° appliance sits on a left/right wall, so Z is the along-wall
  // center; otherwise X is the along-wall center.
  if (hoodRotation === 90 || hoodRotation === 270) return { ...transform, z: rangeTransform.z };
  return { ...transform, x: rangeTransform.x };
}

export function threeDWallDragGhostBox(candidate: PlacedCabinet, room: RoomData) {
  const transform = existingCabinetTransform(candidate, room);
  const footprint = placedFootprint(candidate);
  const box = elevationBox(candidate, room);
  return {
    position: { x: transform.x * INCH, y: (box.bottom + box.height / 2) * INCH, z: transform.z * INCH },
    size: {
      width: Math.max(0.125, footprint.w * INCH),
      height: Math.max(0.125, box.height * INCH),
      depth: Math.max(0.125, footprint.d * INCH),
    },
  };
}

/** When a saved range zone has both an old microwave placeholder and a true hood,
 * display the explicit hood above the cooktop instead of drawing both appliances
 * into the same 2D coordinate. */
export function shouldRenderSavedSceneCabinet(cabinet: PlacedCabinet, placed: PlacedCabinet[]) {
  if (!/^MW[-_]?/i.test(cabinet.masterCode ?? "")) return true;
  const microwaveRotation = ((Number(cabinet.rotation) % 360) + 360) % 360;
  const matchingRange = placed.some((item) => /^RANGE[-_]?/i.test(item.masterCode ?? "")
    && ((Number(item.rotation) % 360) + 360) % 360 === microwaveRotation);
  const matchingHood = placed.some((item) => /^HOOD[-_]?/i.test(item.masterCode ?? "")
    && ((Number(item.rotation) % 360) + 360) % 360 === microwaveRotation);
  return !(matchingRange && matchingHood);
}

/**
 * Older CDB saves sometimes stored only the accessible 24-inch leg depth.
 * The 2D corner-drawer drawing is nevertheless a full 36-by-36 L footprint,
 * so normalize before deriving either its scene body or its 2D-to-3D center.
 */
export function normalizedThreeDFootprint(cabinet: PlacedCabinet) {
  const cornerDrawer = /^cdb[-_]?\d/i.test(cabinet.masterCode) || /corner drawer base/i.test(cabinet.description ?? "");
  if (!cornerDrawer) return placedFootprint(cabinet);
  const size = Math.max(24, Number((cabinet.masterCode.match(/(\d{2})/) ?? [])[1]) || 36);
  return placedFootprint({ ...cabinet, width: size, depth: size });
}

/**
 * Three.js rotates a local cabinet box after its dimensions are applied, while
 * the 2D placed footprint is already expressed in world axes. Reuse the shared
 * 2D footprint for every corner family, then reverse a 90°/270° turn only for
 * the local mesh box. This keeps diagonal, L, blind, and end-return geometry
 * on the exact 2D envelope without double-applying rotation.
 */
export function threeDCornerBodyDimensions(cabinet: PlacedCabinet) {
  const sharedKind = placedCornerGeometryKind(cabinet);
  const isSharedCorner = sharedKind !== "standard";
  if (!isSharedCorner) return null;
  const footprint = normalizedThreeDFootprint(cabinet);
  const rotation = ((Number(cabinet.rotation) % 360) + 360) % 360;
  const quarterTurn = rotation === 90 || rotation === 270;
  return quarterTurn
    ? { width: footprint.d, depth: footprint.w }
    : { width: footprint.w, depth: footprint.d };
}

export function sinkFixtureTransform(sink: SinkFixture) {
  return {
    x: (sink.x + sink.width / 2) * INCH,
    z: (sink.y + sink.depth / 2) * INCH,
    countertopTop: COUNTERTOP_TOP * INCH,
  };
}

export function sinkFaucetTransform(sink: SinkFixture) {
  const sinkTransform = sinkFixtureTransform(sink);
  const offset = sink.sourceDepth ?? sink.depth;
  const back = sink.wallSide === "bottom"
    ? { x: 0, z: offset * INCH * 0.31 }
    : sink.wallSide === "left"
      ? { x: -offset * INCH * 0.31, z: 0 }
      : sink.wallSide === "right"
        ? { x: offset * INCH * 0.31, z: 0 }
        : { x: 0, z: -offset * INCH * 0.31 };
  return {
    x: sinkTransform.x + back.x,
    z: sinkTransform.z + back.z,
    countertopTop: sinkTransform.countertopTop,
    back,
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
  const faucet = sinkFaucetTransform(sink);
  const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.52, 12), faucetMaterial);
  riser.position.set(faucet.x, countertopTop + 0.27, faucet.z);
  riser.userData = { sinkFaucet: true, faucetPlacement: "back" };
  root.add(riser);
  const spout = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.026, 8, 16, Math.PI), faucetMaterial);
  spout.rotation.x = Math.PI / 2;
  spout.position.set(faucet.x - faucet.back.x * 0.55, countertopTop + 0.48, faucet.z - faucet.back.z * 0.55);
  spout.userData = { sinkFaucetSpout: true, faucetPlacement: "back" };
  root.add(spout);
}

export function islandZoneTransform(island: { x: number; y: number; width: number; depth: number }) {
  return {
    x: (island.x + island.width / 2) * INCH,
    z: (island.y + island.depth / 2) * INCH,
    baseWidth: island.width * INCH,
    baseDepth: island.depth * INCH,
    baseHeight: STD.BASE_HEIGHT * INCH,
    counterWidth: (island.width + 1.5) * INCH,
    counterDepth: (island.depth + 1.5) * INCH,
    counterTop: COUNTERTOP_H * INCH,
  };
}

export function ponyWallTransform(ponyWall: Pick<PonyWall, "x" | "y" | "width" | "depth" | "height">) {
  return {
    x: (ponyWall.x + ponyWall.width / 2) * INCH,
    y: ponyWall.height * INCH / 2,
    z: (ponyWall.y + ponyWall.depth / 2) * INCH,
    width: ponyWall.width * INCH,
    depth: ponyWall.depth * INCH,
    height: ponyWall.height * INCH,
  };
}

export function furnitureTransform(furniture: Pick<PlacedFurniture, "x" | "y" | "rotation">, widthIn: number, depthIn: number) {
  return {
    x: (furniture.x + widthIn / 2) * INCH,
    z: (furniture.y + depthIn / 2) * INCH,
    rotation: (furniture.rotation || 0) * Math.PI / 180,
  };
}

function addIslandZone(root: THREE.Group, island: NonNullable<Props["island"]>, counterColor: string) {
  const transform = islandZoneTransform(island);
  const group = new THREE.Group();
  group.position.set(transform.x, 0, transform.z);
  group.userData = { island: true };
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(transform.baseWidth, transform.baseHeight, transform.baseDepth),
    new THREE.MeshStandardMaterial({ color: "#b7a795", roughness: 0.7 }),
  );
  base.position.y = transform.baseHeight / 2;
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(transform.counterWidth, 1.5 * INCH, transform.counterDepth),
    new THREE.MeshStandardMaterial({ color: counterColor, roughness: 0.33, metalness: 0.03 }),
  );
  counter.position.y = transform.counterTop;
  group.add(base, counter);
  root.add(group);
}

function addPonyWall(root: THREE.Group, ponyWall: PonyWall) {
  const transform = ponyWallTransform(ponyWall);
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(transform.width, transform.height, transform.depth),
    new THREE.MeshStandardMaterial({ color: "#ede9e1", roughness: 0.86 }),
  );
  wall.position.set(transform.x, transform.y, transform.z);
  wall.userData = { ponyWallUid: ponyWall.uid };
  root.add(wall);
}

function addFurniture(root: THREE.Group, furniture: PlacedFurniture) {
  const def = FURNITURE_CATALOG.find((entry) => entry.id === furniture.defId);
  if (!def) return;
  const width = def.w * INCH;
  const depth = def.d * INCH;
  const transform = furnitureTransform(furniture, def.w, def.d);
  const group = new THREE.Group();
  group.position.set(transform.x, 0, transform.z);
  group.rotation.y = transform.rotation;
  group.userData = { furnitureUid: furniture.uid, furnitureDefId: furniture.defId };
  const material = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 });
  const height = def.category === "table" ? 2.5 : def.category === "stool" ? 2.1 : 1.5;
  const body = def.shape === "round"
    ? new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, height, 20), material)
    : new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  body.position.y = height / 2;
  group.add(body);
  root.add(group);
}

export function openingTransform(opening: WallOpening, roomWidth: number, roomDepth: number) {
  const offset = opening.offset + opening.width / 2;
  if (opening.side === "bottom") return { x: offset, z: roomDepth - 0.06, rotation: Math.PI };
  if (opening.side === "left") return { x: 0.06, z: offset, rotation: Math.PI / 2 };
  if (opening.side === "right") return { x: roomWidth - 0.06, z: offset, rotation: -Math.PI / 2 };
  return { x: offset, z: 0.06, rotation: 0 };
}

export function addWallOpening(root: THREE.Group, opening: WallOpening, roomWidth: number, roomDepth: number) {
  const { x, z, rotation } = openingTransform(opening, roomWidth, roomDepth);
  const group = new THREE.Group();
  group.position.set(x * INCH, (opening.sill + opening.height / 2) * INCH, z * INCH);
  group.rotation.y = rotation;
  group.userData = { openingUid: opening.uid, kind: opening.kind, label: opening.label };
  const width = opening.width * INCH;
  const height = opening.height * INCH;
  const trimMaterial = new THREE.MeshStandardMaterial({ color: "#f4f0e8", roughness: 0.5 });
  const openingDepth = 0.12;
  const trimWidth = Math.min(0.12, Math.max(0.055, width * 0.075));
  const backing = new THREE.Mesh(new THREE.BoxGeometry(width + trimWidth * 2, height + trimWidth * 2, 0.07), trimMaterial);
  backing.userData = { architecturalOpeningBacking: true };
  group.add(backing);
  const trimPieces = [
    [width + trimWidth * 2, trimWidth, 0, height / 2 + trimWidth / 2],
    [width + trimWidth * 2, trimWidth, 0, -height / 2 - trimWidth / 2],
    [trimWidth, height, -width / 2 - trimWidth / 2, 0],
    [trimWidth, height, width / 2 + trimWidth / 2, 0],
  ] as const;
  for (const [pieceWidth, pieceHeight, pieceX, pieceY] of trimPieces) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(pieceWidth, pieceHeight, openingDepth), trimMaterial);
    trim.position.set(pieceX, pieceY, openingDepth / 2);
    trim.userData = { architecturalOpeningTrim: true, openingKind: opening.kind };
    group.add(trim);
  }
  const isWindow = opening.kind === "window";
  const pane = new THREE.Mesh(new THREE.BoxGeometry(width - 0.08, height - 0.08, 0.08), new THREE.MeshStandardMaterial({ color: isWindow ? "#a9c9dc" : "#4a3528", roughness: 0.28, metalness: isWindow ? 0.12 : 0 }));
  pane.position.z = 0.01;
  group.add(pane);
  if (isWindow) {
    const muntin = new THREE.MeshStandardMaterial({ color: "#f7f5ef", roughness: 0.45 });
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.04, height - 0.05, 0.09), muntin);
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(width - 0.05, 0.04, 0.09), muntin);
    vertical.userData = { windowMuntin: "vertical" };
    horizontal.userData = { windowMuntin: "horizontal" };
    const sill = new THREE.Mesh(new THREE.BoxGeometry(width + trimWidth * 2.7, trimWidth * 1.5, 0.2), trimMaterial);
    sill.position.set(0, -height / 2 - trimWidth * 0.85, 0.12);
    sill.userData = { architecturalWindowSill: true };
    group.add(vertical, horizontal, sill);
  } else {
    const doorPanelMaterial = new THREE.MeshStandardMaterial({ color: "#6f503b", roughness: 0.54 });
    const upperPanel = new THREE.Mesh(new THREE.BoxGeometry(width * 0.68, height * 0.26, 0.035), doorPanelMaterial);
    const lowerPanel = new THREE.Mesh(new THREE.BoxGeometry(width * 0.68, height * 0.43, 0.035), doorPanelMaterial);
    upperPanel.position.set(0, height * 0.19, 0.065);
    lowerPanel.position.set(0, -height * 0.2, 0.065);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), new THREE.MeshStandardMaterial({ color: "#c7b287", roughness: 0.28, metalness: 0.6 }));
    handle.position.set(width * 0.36, 0, 0.1);
    upperPanel.userData = { architecturalDoorPanel: "upper" };
    lowerPanel.userData = { architecturalDoorPanel: "lower" };
    handle.userData = { architecturalDoorHandle: true };
    group.add(upperPanel, lowerPanel, handle);
  }
  root.add(group);
}

export function compactWallCodeDimensions(cabinet: Pick<PlacedCabinet, "masterCode" | "placement">) {
  if (cabinet.placement !== "wall") return null;
  // Compact wall codes are width-first: W3024 means 30" wide by 24" high.
  // Some imported catalog rows carried these values transposed, so the code is
  // authoritative for the W[width][height] family in the 3D scene.
  const match = (cabinet.masterCode ?? "").toUpperCase().match(/^W-?(\d{2})-?(\d{2})(?:[A-Z]+)?$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width >= 9 && height >= 9 ? { width, height } : null;
}

export function existingCabinetSku(cabinet: PlacedCabinet): SceneSku {
  // The shared saved-placement contract owns every corner family. The 3D
  // renderer receives its classification rather than re-inferring the shape.
  const sharedCornerKind = placedCornerGeometryKind(cabinet);
  const footprint = sharedCornerKind !== "standard" ? normalizedThreeDFootprint(cabinet) : null;
  const cornerBody = threeDCornerBodyDimensions(cabinet);
  const applianceCode = `${cabinet.masterCode ?? ""}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  const inferredAppliancePlacement = /^(?:fridge|range|hood|dw|wine|mw)/i.test(cabinet.masterCode ?? "");
  const placementType = cabinet.placement === "appliance" || inferredAppliancePlacement ? "appliance" : cabinet.placement;
  const appliance = placementType === "appliance"
    ? APPLIANCES.find((item) => {
      const definition = item as typeof item & { id?: string; code?: string };
      const key = `${definition.masterCode ?? definition.id ?? definition.code ?? definition.key ?? ""}`.toLowerCase().replace(/[^a-z0-9]/g, "");
      return key === applianceCode;
    })
    : undefined;
  const codeDimensions = compactWallCodeDimensions(cabinet);
  return {
    placementUid: cabinet.uid,
    distributorSkuId: -(Math.abs(cabinet.cabinetId) || 1),
    cabinetId: cabinet.cabinetId,
    masterCode: cabinet.masterCode,
    description: cabinet.description,
    placementType,
    // The placed record is primary. Older appliance records can lack one of
    // these dimensions, in which case use the same APPLIANCES definition that
    // created the 2D placement—never the generic 24/12-inch cabinet defaults.
    width: cornerBody?.width ?? footprint?.w ?? codeDimensions?.width ?? cabinet.width ?? appliance?.width,
    height: codeDimensions?.height ?? cabinet.height ?? appliance?.elevHeight ?? (placementType === "wall" ? STD.WALL_HEIGHT : placementType === "tall" ? STD.TALL_HEIGHT : STD.BASE_HEIGHT),
    depth: cornerBody?.depth ?? footprint?.d ?? cabinet.depth ?? appliance?.depth,
    numberOfDoors: cabinet.numberOfDoors ?? null,
    numberOfDrawers: cabinet.numberOfDrawers ?? null,
    doorOrientation: cabinet.doorOrientation ?? null,
    swing: cabinet.swing ?? null,
    handleSide: cabinet.handleSide === "left" || cabinet.handleSide === "right" ? cabinet.handleSide : null,
    hardwarePosition: cabinet.hardwarePosition ?? null,
    openingType: cabinet.openingType ?? null,
    openingWidth: cabinet.openingWidth ?? null,
    openingHeight: cabinet.openingHeight ?? null,
    doorHeight: cabinet.doorHeight ?? null,
    drawerHeight: cabinet.drawerHeight ?? null,
    drawerLayout: cabinet.drawerLayout ?? null,
    layoutSpec: cabinet.layoutSpec ?? null,
    ovenType: cabinet.ovenType ?? null,
    graphicType: cabinet.customProfile ?? null,
    customProfile: cabinet.customProfile ?? null,
    facePattern: cabinet.facePattern ?? null,
    cornerType: sharedCornerKind === "diagonal" ? "diagonal" : sharedCornerKind === "l-shape" || sharedCornerKind === "corner-drawer" ? "l-shape" : cabinet.cornerType ?? null,
    cornerGeometryKind: sharedCornerKind,
    catalogImageUrl: cabinet.catalogImageUrl ?? appliance?.catalogImageUrl ?? null,
    decorativeEnd: cabinet.decorativeEnd ?? "none",
  };
}

export function threeDSceneInputDiagnostics(placed: PlacedCabinet[], doorSampleUrl: string | null | undefined) {
  const mapped = placed.map(existingCabinetSku);
  return {
    cabinetCount: mapped.length,
    doorSampleUrl: doorSampleUrl ?? null,
    ovenTowerCount: mapped.filter((item) => Boolean(item.ovenType) || /(?:^|[-_])(UOC|OC|OVEN)|oven cabinet/i.test(`${item.masterCode} ${item.description ?? ""}`)).length,
    measuredDrawerCabinetCount: mapped.filter((item) => item.drawerLayout != null || item.drawerHeight != null).length,
    specialtyCabinetCount: mapped.filter((item) => item.graphicType != null || item.facePattern != null || item.cornerType != null).length,
    mapped,
  };
}

export type ThreeDDesignParityInput = Pick<Props,
  "roomOverride" | "placed" | "openings" | "sinks" | "island" | "furniture" | "ponyWalls"
  | "catalogDoorSampleUrl" | "catalogFinishOverride" | "catalogFinishName"
  | "catalogCountertopName" | "catalogCountertopColor" | "initialPresentation"
>;

/**
 * A single auditable representation of the 2D entities and shared transforms
 * consumed by the deterministic 3D renderer. Raw source records are retained
 * beside their renderer inputs so that fields cannot silently disappear during
 * saved-design hydration or future geometry refactors.
 */
export function threeDDesignParitySnapshot({
  roomOverride,
  placed = [],
  openings = [],
  sinks = [],
  island = null,
  furniture = [],
  ponyWalls = [],
  catalogDoorSampleUrl,
  catalogFinishOverride,
  catalogFinishName,
  catalogCountertopName,
  catalogCountertopColor,
  initialPresentation,
}: ThreeDDesignParityInput) {
  const room = roomOverride ?? { width: 144, depth: 120, ceilingHeight: 96 } as RoomData;
  return {
    room: { width: room.width, depth: room.depth, ceilingHeight: room.ceilingHeight },
    materials: {
      doorSampleUrl: catalogDoorSampleUrl ?? null,
      cabinetColor: catalogFinishOverride ?? null,
      cabinetName: catalogFinishName ?? null,
      countertopName: catalogCountertopName ?? null,
      countertopColor: catalogCountertopColor ?? null,
      presentation: initialPresentation ?? null,
    },
    cabinets: placed.map((source) => ({
      source,
      footprint: normalizedThreeDFootprint(source),
      transform: existingCabinetTransform(source, room),
      sku: existingCabinetSku(source),
      countertopSupported: shouldRenderCountertopOverSceneItem(source.placement, source.masterCode, source.description),
    })),
    openings: openings.map((source) => ({ source, transform: openingTransform(source, room.width, room.depth) })),
    sinks: sinks.map((source) => ({ source, transform: sinkFixtureTransform(source) })),
    island: island ? { source: island, transform: islandZoneTransform(island) } : null,
    furniture: furniture.map((source) => {
      const definition = FURNITURE_CATALOG.find((entry) => entry.id === source.defId) ?? null;
      return {
        source,
        definition,
        transform: definition ? furnitureTransform(source, definition.w, definition.d) : null,
      };
    }),
    ponyWalls: ponyWalls.map((source) => ({ source, transform: ponyWallTransform(source) })),
  };
}

/** Stable signature of the exact 2D inputs that must create a fresh WebGL scene. */
export function threeDSceneRevisionKey(
  room: RoomData,
  placed: PlacedCabinet[],
  openings: WallOpening[],
  sinks: SinkFixture[],
  island: { x: number; y: number; width: number; depth: number } | null,
  furniture: PlacedFurniture[],
  ponyWalls: PonyWall[],
  doorSampleUrl: string | null | undefined,
  countertopMaterialKey?: string | null,
  catalogFinishColor?: string | null,
) {
  return JSON.stringify({ parity: threeDDesignParitySnapshot({
    roomOverride: room,
    placed,
    openings,
    sinks,
    island,
    furniture,
    ponyWalls,
    catalogDoorSampleUrl: doorSampleUrl,
    catalogCountertopColor: countertopMaterialKey,
    catalogFinishOverride: catalogFinishColor,
  }), countertopMaterialKey: countertopMaterialKey ?? null });
}

export function threeDPlanSyncText({
  placed,
  openings,
  sinks,
  island,
  furniture,
  ponyWalls,
}: Pick<Props, "placed" | "openings" | "sinks" | "island" | "furniture" | "ponyWalls">) {
  return `Plan sync: ${placed?.length ?? 0} cabinet items · ${openings?.length ?? 0} openings · ${sinks?.length ?? 0} sinks · ${island ? 1 : 0} island · ${furniture?.length ?? 0} furniture · ${ponyWalls?.length ?? 0} pony walls`;
}

export function hasPersistedTwoDScene({
  placed,
  openings,
  sinks,
  island,
  furniture,
  ponyWalls,
}: Pick<Props, "placed" | "openings" | "sinks" | "island" | "furniture" | "ponyWalls">) {
  return Boolean(
    (placed?.length ?? 0) ||
    (openings?.length ?? 0) ||
    (sinks?.length ?? 0) ||
    island ||
    (furniture?.length ?? 0) ||
    (ponyWalls?.length ?? 0),
  );
}

export function threeDUsesAuthoritativePlanScene(
  roomOverride: RoomData | undefined,
  input: Pick<Props, "placed" | "openings" | "sinks" | "island" | "furniture" | "ponyWalls">,
) {
  return Boolean(roomOverride) || hasPersistedTwoDScene(input);
}

export function rangeHoodSceneStatus(placed: PlacedCabinet[]) {
  const ranges = placed.filter((item) => /^RANGE-/.test(item.masterCode));
  const hasRange = ranges.length > 0;
  const hasRangeHood = placed.some((item) => /^HOOD-/.test(item.masterCode));
  const hasOverRangeMicrowave = placed.some((item) => {
    const source = `${item.masterCode ?? ""} ${item.description ?? ""}`.toLowerCase();
    const explicitlyOverRange = /over[-\s]?range\s+microwave|microwave\s+over[-\s]?range|\botr\b/.test(source);
    const isStandardOtrSku = /^mw[-_]?30\b/i.test(item.masterCode ?? "");
    return explicitlyOverRange || isStandardOtrSku;
  }) || ranges.some((range) => placed.some((item) => isMicrowaveOverRangePair(range, item)));
  return { hasRange, hasRangeHood, hasOverRangeMicrowave, needs2DPlacement: hasRange && !hasRangeHood && !hasOverRangeMicrowave };
}

/**
 * Auditable visibility inputs for the objects that can disappear in a dense
 * room render. The mesh builders consume these same placement and support
 * contracts, so a regression catches a missing hood, shifted tall appliance,
 * or unsupported counter run before a visual review is needed.
 */
export function threeDSceneVisibilityContract(placed: PlacedCabinet[], room: RoomData) {
  const hood = placed.find((item) => /^HOOD-/.test(item.masterCode)) ?? null;
  const tall = placed.filter((item) => item.placement === "tall" || /^(FRIDGE|WR|REP)/.test(item.masterCode));
  return {
    hood: hood
      ? {
        masterCode: hood.masterCode,
        transform: existingCabinetTransform(hood, room),
        geometry: rangeHoodGeometry(hood.width ?? 30, hood.depth ?? 18, hood.height ?? 18),
      }
      : null,
    tall: tall.map((item) => ({ masterCode: item.masterCode, transform: existingCabinetTransform(item, room) })),
    countertopSupport: placed
      .filter((item) => shouldRenderCountertopOverSceneItem(item.placement, item.masterCode, item.description))
      .map((item) => item.masterCode),
  };
}

export function resolvedThreeDCountertopFinish(
  initialPresentation: InteractiveRoomPresentation | undefined,
  catalogCountertopColor: string | null | undefined,
  scene: InteractiveRoomScene,
) {
  return initialPresentation?.countertopFinish
    ?? catalogCountertopColor
    ?? scene.materials?.defaults.countertop
    ?? "#e9e7e2";
}

export function threeDPresentationEmissionKey(cabinetFinish: string, countertopFinish: string) {
  return `${cabinetFinish}::${countertopFinish}`;
}

export function shouldEmitThreeDPresentation(previousKey: string | null, cabinetFinish: string, countertopFinish: string) {
  return previousKey !== threeDPresentationEmissionKey(cabinetFinish, countertopFinish);
}

export function resolvedThreeDWallHeights(room: RoomData | undefined, fallbackHeight: number): Record<WallSide, number> {
  const fallback = constrainedThreeDWallHeight(room?.ceilingHeight ?? fallbackHeight, fallbackHeight);
  return THREE_D_WALL_SIDES.reduce((heights, side) => {
    const selected = room?.wallCeilings?.[side]?.high;
    heights[side] = constrainedThreeDWallHeight(selected ?? fallback, fallback);
    return heights;
  }, {} as Record<WallSide, number>);
}

/** Changes one wall only; all other independent room-wall heights remain intact. */
export function updatedThreeDWallHeights(current: Record<WallSide, number>, side: WallSide, nextHeight: number): Record<WallSide, number> {
  return { ...current, [side]: nextHeight };
}

/** Resolves a rectangular or polygon room edge to the familiar Back, Left, Right, or Front control. */
export function threeDWallSideForEdge(start: { x: number; y: number }, end: { x: number; y: number }, room: Pick<RoomData, "width" | "depth">): WallSide {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  // room dimensions are persisted in inches, while the rendered polygon is in
  // Three.js feet. Compare like-for-like so the front and right edges do not
  // collapse into the back and left controls on every room.
  const renderedWidth = room.width * INCH;
  const renderedDepth = room.depth * INCH;
  // roomPolygon inverts plan Y for Three.js (front becomes negative Z), so
  // restore that sign before choosing between Back/top and Front/bottom.
  const renderedPlanY = -midY;
  if (Math.abs(dx) >= Math.abs(dy)) return renderedPlanY <= renderedDepth / 2 ? "top" : "bottom";
  return midX <= renderedWidth / 2 ? "left" : "right";
}

/** A rectangular room polygon is emitted clockwise as Back, Right, Front, Left. */
export function threeDWallSideForPolygonEdge(index: number, edgeCount: number, start: { x: number; y: number }, end: { x: number; y: number }, room: Pick<RoomData, "width" | "depth">): WallSide {
  if (edgeCount === 4) return (["top", "right", "bottom", "left"] as const)[index % 4];
  return threeDWallSideForEdge(start, end, room);
}

/**
 * Upper cabinets require a normal 96-inch room wall behind them, even when an
 * individual upper happens to end below that height. The preview never silently
 * changes a user-selected wall value; it uses this contract to surface a clear
 * warning instead.
 */
export function threeDUpperCabinetWallMinimums(placed: PlacedCabinet[], room: RoomData): Partial<Record<WallSide, number>> {
  const physicalToSide: Record<ThreeDPlacedWall, WallSide> = { back: "top", right: "right", front: "bottom", left: "left" };
  return placed.reduce((minimums, cabinet) => {
    if (cabinet.placement !== "wall") return minimums;
    const physicalWall = threeDPlacedWall(cabinet, room);
    if (!physicalWall) return minimums;
    const side = physicalToSide[physicalWall];
    const elevation = elevationBox(cabinet, room);
    const resolvedTop = elevation.bottom + elevation.height;
    const cabinetTop = Number.isFinite(resolvedTop) ? resolvedTop : 0;
    minimums[side] = Math.max(minimums[side] ?? 0, 96, cabinetTop);
    return minimums;
  }, {} as Partial<Record<WallSide, number>>);
}

export function InteractiveRoom3D({ scene, placed = [], roomOverride, openings = [], sinks = [], island = null, furniture = [], ponyWalls = [], orderSummary, orderLines = [], initialPresentation, catalogFinishOverride, cabinetFinishOverrides, cabinetDoorProfiles, cabinetDoorSampleUrls, cabinetFrontVisuals, catalogDoorSampleUrl, catalogDoorProfile, catalogFinishName, catalogCountertopName, catalogCountertopColor, shareContext, catalogItems = [], catalogDragItem = null, catalogDropWall, onAddCatalogItem, onAddRangeHood, onSaveToAccount, onSyncCart, onPresentationChange, onRoomWallHeightChange, onRoomWallHeightsChange, onMoveCabinet, onMoveCabinetTo, selectedCabinetUid, onSelectCabinet, onOpenCabinetEditor, onRotateCabinet, onRemoveCabinet, showWallLayer, onToggleWallLayer, temporaryPreviewMessage, onClearTemporaryPreview, temporaryPreviewCounter, temporaryPreviewTransitionKey, cabinetConfigHref, embedded = false, hybridPlanUnderlay = false, className }: Props) {
  const previewRootRef = useRef<HTMLElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const catalogRootRef = useRef<THREE.Group | null>(null);
  const cameraViewRef = useRef<ThreeDCameraViewSnapshot | null>(null);
  const sharedCameraViewRef = useRef<ThreeDCameraShareView | null>(typeof window === "undefined" ? null : parseThreeDCameraShareView(new URLSearchParams(window.location.search).get(THREE_D_CAMERA_VIEW_QUERY_PARAM)));
  const pointerStartRef = useRef<{ x: number; y: number; button: number } | null>(null);
  const rightDragRef = useRef<{
    pointerId: number;
    uid: string;
    source: PlacedCabinet;
    startX: number;
    startY: number;
    active: boolean;
    preview: CabinetWallDragPreview | null;
    visualOrigins: Array<{ object: THREE.Object3D; x: number; z: number }>;
  } | null>(null);
  const rightDragGhostRef = useRef<THREE.LineSegments | null>(null);
  const suppressContextMenuRef = useRef(false);
  const lastEmittedPresentationRef = useRef<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [cameraPreset, setCameraPreset] = useState<ThreeDCameraPreset>("presentation");
  const [showRoomContext, setShowRoomContext] = useState(true);
  const [wallHeightIn, setWallHeightIn] = useState(() => constrainedThreeDWallHeight(roomOverride?.ceilingHeight ?? dimensions(scene.roomShape?.defaultDimensions).ceilingHeight));
  const [wallHeights, setWallHeights] = useState<Record<WallSide, number>>(() => resolvedThreeDWallHeights(roomOverride, wallHeightIn));
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [cabinetFinish, setCabinetFinish] = useState(initialPresentation?.cabinetFinish ?? "catalog");
  const [countertopFinish, setCountertopFinish] = useState(() => resolvedThreeDCountertopFinish(initialPresentation, catalogCountertopColor, scene));
  const [materialTransitioning, setMaterialTransitioning] = useState(false);
  const [temporaryPreviewFading, setTemporaryPreviewFading] = useState(false);
  useEffect(() => {
    if (!temporaryPreviewTransitionKey || typeof window === "undefined") { setTemporaryPreviewFading(false); return; }
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!threeDPreviewFadeAllowed(reducedMotion)) { setTemporaryPreviewFading(false); return; }
    setTemporaryPreviewFading(true);
    const frame = window.requestAnimationFrame(() => setTemporaryPreviewFading(false));
    return () => window.cancelAnimationFrame(frame);
  }, [temporaryPreviewTransitionKey]);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [workspacePanel, setWorkspacePanel] = useState<"catalog" | "view" | "finish" | "room" | "output" | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogGroup, setCatalogGroup] = useState<ThreeDCatalogGroup>("All");
  const [draggedCatalogId, setDraggedCatalogId] = useState<string | null>(null);
  const [catalogDragMeasurement, setCatalogDragMeasurement] = useState<{ item: InteractiveRoomCatalogItem; fit: WallGapFitPreview; wall: WallSide } | null>(null);
  const [cabinetDragMeasurement, setCabinetDragMeasurement] = useState<{ cabinet: PlacedCabinet; preview: CabinetWallDragPreview } | null>(null);
  const [selectedCabinet, setSelectedCabinet] = useState<{ uid: string | null; masterCode: string; description: string | null; distributorSkuId: number | null } | null>(null);
  const [movePanelOpen, setMovePanelOpen] = useState(false);
  useEffect(() => {
    const hostSelection = threeDSelectionFromPlaced(selectedCabinetUid, placed);
    if (!hostSelection) {
      setSelectedCabinet(null);
      setMovePanelOpen(false);
      return;
    }
    setSelectedCabinet((current) => current?.uid === hostSelection.uid ? current : hostSelection);
  }, [placed, selectedCabinetUid]);
  const [moveIncrementIn, setMoveIncrementIn] = useState<(typeof THREE_D_CABINET_MOVE_STEPS)[number]>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [doorTextureState, setDoorTextureState] = useState<"not-requested" | "loading" | "loaded" | "failed">("not-requested");
  const validSuggestions = useMemo(() => scene.suggestions.filter((entry) => entry.sku), [scene.suggestions]);
  const renderExistingDesign = threeDUsesAuthoritativePlanScene(roomOverride, { placed, openings, sinks, island, furniture, ponyWalls });
  const upperCabinetWallMinimums = useMemo(
    () => roomOverride ? threeDUpperCabinetWallMinimums(placed, roomOverride) : {},
    [placed, roomOverride],
  );
  const rangeHoodStatus = useMemo(() => rangeHoodSceneStatus(placed), [placed]);
  // The active designer style is the customer’s catalog selection. Prefer its
  // resolved finish color over a sparse style-record color field from the scene
  // endpoint, then fall back to the server-derived catalog material.
  const catalogFinish = resolvedCatalogFinish(scene, catalogFinishOverride);
  // Saved-plan fallback scenes deliberately carry neutral material metadata.
  // The active 2D selected style remains authoritative for physical 3D face
  // geometry, so a Slate Echo Shaker never silently turns into a flat slab.
  const resolvedDoorProfile = resolvedThreeDDoorProfile(scene, catalogDoorProfile);
  // The supplied selected Cabinet Config sample is the authoritative finish when
  // a style has no explicit color field. It is applied to actual face panels,
  // while physical rails, stiles, carcasses, and skins remain constructed meshes.
  const activeDoorTexture = resolvedThreeDDoorSampleUrl("catalog", catalogDoorSampleUrl, renderExistingDesign);
  const visibleMaterialMode = threeDVisibleMaterialMode(activeDoorTexture, doorTextureState);
  const resolvedCabinetFinish = catalogFinish;
  const cabinetFinishLabel = catalogFinishName ?? scene.materials?.cabinet.publicName ?? scene.materials?.cabinet.name ?? scene.materials?.cabinet.finish ?? "Active catalog finish";
  const countertopFinishLabel = COUNTERTOP_FINISHES.find((option) => option.color === countertopFinish)?.name ?? "Custom countertop";
  const quoteMaterials = quoteMaterialDetails({
    cabinetPreview: cabinetFinishLabel,
    countertopPreview: countertopFinishLabel,
    catalogFinishName: catalogFinishName ?? scene.materials?.cabinet.publicName ?? scene.materials?.cabinet.name ?? scene.materials?.cabinet.finish,
    catalogCountertopName,
  });
  const visibleCatalogItems = useMemo(
    () => filteredThreeDCatalogItems(catalogItems, catalogGroup, catalogSearch),
    [catalogItems, catalogGroup, catalogSearch],
  );
  const shareMutation = trpc.roomLayouts.createShare.useMutation();
  const shareThumbnailMutation = trpc.roomLayouts.updateShareThumbnail.useMutation();
  const emailQuoteMutation = trpc.roomLayouts.emailQuote.useMutation();

  useEffect(() => {
    const nextGlobal = constrainedThreeDWallHeight(roomOverride?.ceilingHeight ?? dimensions(scene.roomShape?.defaultDimensions).ceilingHeight);
    setWallHeightIn(nextGlobal);
    setWallHeights(resolvedThreeDWallHeights(roomOverride, nextGlobal));
  }, [roomOverride?.ceilingHeight, roomOverride?.wallCeilings, scene.roomShape?.defaultDimensions]);

  const updateWallHeight = (value: unknown) => {
    const nextHeight = constrainedThreeDWallHeight(value, wallHeightIn);
    setWallHeightIn(nextHeight);
    const nextHeights = THREE_D_WALL_SIDES.reduce((heights, side) => ({ ...heights, [side]: nextHeight }), {} as Record<WallSide, number>);
    setWallHeights(nextHeights);
    onRoomWallHeightChange?.(nextHeight);
    onRoomWallHeightsChange?.(nextHeights);
  };

  const updateWallHeightForSide = (side: WallSide, value: unknown) => {
    const nextHeight = constrainedThreeDWallHeight(value, wallHeights[side]);
    setWallHeights((current) => {
      const nextHeights = updatedThreeDWallHeights(current, side, nextHeight);
      onRoomWallHeightsChange?.(nextHeights);
      return nextHeights;
    });
  };

  useEffect(() => {
    const nextCabinetFinish = "catalog";
    const nextCountertopFinish = resolvedThreeDCountertopFinish(initialPresentation, catalogCountertopColor, scene);
    setCabinetFinish((current) => current === nextCabinetFinish ? current : nextCabinetFinish);
    setCountertopFinish((current: string) => current === nextCountertopFinish ? current : nextCountertopFinish);
  }, [scene, catalogCountertopColor, initialPresentation?.cabinetFinish, initialPresentation?.countertopFinish]);

  useEffect(() => {
    setMaterialTransitioning(true);
    const timer = window.setTimeout(() => setMaterialTransitioning(false), 340);
    return () => window.clearTimeout(timer);
  }, [cabinetFinish, countertopFinish]);

  useEffect(() => {
    if (!onPresentationChange) return;
    const key = threeDPresentationEmissionKey(cabinetFinish, countertopFinish);
    if (!shouldEmitThreeDPresentation(lastEmittedPresentationRef.current, cabinetFinish, countertopFinish)) return;
    lastEmittedPresentationRef.current = key;
    onPresentationChange({ cabinetFinish, countertopFinish });
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
      ? { ...roomOverride, ceilingHeight: wallHeightIn }
      : { ...dimensions(scene.roomShape?.defaultDimensions), ceilingHeight: wallHeightIn };
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
    renderer.toneMappingExposure = 1.02;
    mount.replaceChildren(renderer.domElement);

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color("#f6f3ed");
    const camera = new THREE.PerspectiveCamera(42, canvasWidth / canvasHeight, 0.1, 100);
    const maxSpan = Math.max(room.width, room.depth) * INCH;
    const cameraDistances = threeDCameraDistanceLimits(maxSpan);
    const sharedCameraView = sharedCameraViewRef.current ? constrainedThreeDCameraShareView(sharedCameraViewRef.current, cameraDistances) : null;
    const savedCameraView = cameraViewRef.current;
    const restoreCameraView = Boolean(sharedCameraView) || threeDShouldRestoreCameraView(savedCameraView, cameraPreset, resetKey);
    const restoredView = sharedCameraView ?? savedCameraView;
    camera.position.copy(restoreCameraView && restoredView ? restoredView.position : threeDCameraPresetPosition(cameraPreset, maxSpan));
    if (restoreCameraView && restoredView) camera.zoom = restoredView.zoom;
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    if (restoreCameraView && restoredView) controls.target.copy(restoredView.target);
    else controls.target.set(room.width * INCH * 0.5, 3.1, room.depth * INCH * 0.45);
    sharedCameraViewRef.current = null;
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.68;
    controls.zoomSpeed = 0.84;
    controls.panSpeed = 0.72;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = Math.PI / 2.02;
    controls.minDistance = cameraDistances.minDistance;
    controls.maxDistance = cameraDistances.maxDistance;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.1;
    controls.update();

    threeScene.add(new THREE.HemisphereLight("#fff8eb", "#526174", 2.45));
    const keyLight = new THREE.DirectionalLight("#fff6e8", 3.1);
    keyLight.position.set(maxSpan, maxSpan * 1.8, maxSpan * 0.8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = maxSpan * 4;
    threeScene.add(keyLight);
    const fillLight = new THREE.DirectionalLight("#b7d1ef", 1.25);
    fillLight.position.set(-maxSpan, maxSpan, maxSpan);
    threeScene.add(fillLight);
    const wallHeight = Math.max(...Object.values(wallHeights)) * INCH;
    const warmLight = new THREE.PointLight("#ffdca6", 18, maxSpan * 3.2, 2);
    warmLight.position.set(room.width * INCH * 0.52, wallHeight * 0.76, room.depth * INCH * 0.48);
    threeScene.add(warmLight);

    const materialDefaults = { ...(scene.materials?.defaults ?? { floor: "#b89778", countertop: "#e9e7e2", backsplash: "#d9d5cc", wall: "#efece6" }), countertop: countertopFinish };
    const polygon = roomPolygon(activeThreeDRoomGeometry(roomOverride, scene.roomShape), room.width, room.depth);
    const floorShape = new THREE.Shape(polygon);
    const floor = new THREE.Mesh(
      new THREE.ExtrudeGeometry(floorShape, { depth: 0.08, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: materialDefaults.floor, roughness: 0.62, metalness: 0.02 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.08;
    floor.receiveShadow = true;
    threeScene.add(floor);
    if (hybridPlanUnderlay && roomOverride) {
      const underlayGeometry = new THREE.ShapeGeometry(floorShape);
      underlayGeometry.computeBoundingBox();
      const bounds = underlayGeometry.boundingBox;
      const positions = underlayGeometry.getAttribute("position");
      const uvs = underlayGeometry.getAttribute("uv");
      if (bounds) {
        const spanX = Math.max(bounds.max.x - bounds.min.x, 0.0001);
        const spanY = Math.max(bounds.max.y - bounds.min.y, 0.0001);
        for (let index = 0; index < positions.count; index++) {
          uvs.setXY(index, (positions.getX(index) - bounds.min.x) / spanX, 1 - (positions.getY(index) - bounds.min.y) / spanY);
        }
        uvs.needsUpdate = true;
      }
      const underlay = new THREE.Mesh(
        underlayGeometry,
        new THREE.MeshBasicMaterial({ map: hybridPlanTexture(hybridPlanUnderlayModel(roomOverride, placed, openings)), transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide }),
      );
      underlay.rotation.x = -Math.PI / 2;
      underlay.position.y = 0.008;
      underlay.userData = { hybridPlanUnderlay: true, source: "authoritative-saved-plan" };
      threeScene.add(underlay);
    }

    // Room walls must remain visible as context without ever becoming opaque
    // screens over cabinetry when a mobile orbit moves the camera through them.
    const wallMaterial = new THREE.MeshStandardMaterial({ color: materialDefaults.wall, roughness: 0.82, side: THREE.DoubleSide, transparent: true, opacity: showRoomContext ? THREE_D_WALL_OPACITY : 0.055, depthWrite: THREE_D_WALL_DEPTH_WRITE });
    const roomEdgeMaterial = new THREE.MeshStandardMaterial({ color: "#d1cbc1", roughness: 0.58, metalness: 0.04 });
    polygon.forEach((start, index) => {
      const end = polygon[(index + 1) % polygon.length];
      const dx = end.x - start.x;
      const dz = -(end.y - start.y);
      const length = Math.hypot(dx, dz);
      const side = threeDWallSideForPolygonEdge(index, polygon.length, start, end, room);
      const sideWallHeight = wallHeights[side] * INCH;
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, sideWallHeight), wallMaterial.clone());
      wall.position.set((start.x + end.x) / 2, sideWallHeight / 2, (-start.y + -end.y) / 2);
      wall.rotation.y = Math.atan2(dz, dx);
      wall.userData = { roomWall: true, physicalWallSide: side, wallHeightIn: wallHeights[side] };
      if (index > 1) (wall.material as THREE.MeshStandardMaterial).opacity = showRoomContext ? 0.18 : 0.025;
      threeScene.add(wall);
      const baseboard = new THREE.Mesh(new THREE.BoxGeometry(length, 0.08, 0.05), roomEdgeMaterial);
      baseboard.position.set((start.x + end.x) / 2, 0.04, (-start.y + -end.y) / 2);
      baseboard.rotation.y = Math.atan2(dz, dx);
      baseboard.userData = { roomBaseboard: true, architecturalContextDetail: true };
      threeScene.add(baseboard);
      const ceilingEdge = new THREE.Mesh(new THREE.BoxGeometry(length, 0.035, 0.035), roomEdgeMaterial);
      ceilingEdge.position.set((start.x + end.x) / 2, sideWallHeight - 0.018, (-start.y + -end.y) / 2);
      ceilingEdge.rotation.y = Math.atan2(dz, dx);
      ceilingEdge.userData = { roomCeilingEdge: true, architecturalContextDetail: true };
      threeScene.add(ceilingEdge);
    });
    // Keep the floor visually warm and uncluttered; physical room edges and
    // cabinet shadows provide scale better than a generic editor grid.
    const floorContact = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(room.width, room.depth) * INCH * 0.32, 48),
      new THREE.MeshBasicMaterial({ color: "#73685b", transparent: true, opacity: 0.07, depthWrite: false }),
    );
    floorContact.rotation.x = -Math.PI / 2;
    floorContact.position.set(room.width * INCH * 0.52, 0.006, room.depth * INCH * 0.48);
    floorContact.scale.set(1.35, 0.72, 1);
    floorContact.userData = { presentationContactShadow: true };
    threeScene.add(floorContact);

    const catalogRoot = new THREE.Group();
    const cursor = { back: 3, left: 3, right: 3, front: 3 };
    const finish = resolvedCabinetFinish;
    const hasAnyDoorSample = Boolean(activeDoorTexture || Object.values(cabinetDoorSampleUrls ?? {}).some(Boolean));
    setDoorTextureState(hasAnyDoorSample ? "loading" : "not-requested");
    catalogRoot.userData.sceneInput = threeDSceneInputDiagnostics(placed, activeDoorTexture);
    let disposed = false;
    const updateDoorTextureState = (state: "loading" | "loaded" | "failed") => {
      if (!disposed) setDoorTextureState(state);
    };
    if (renderExistingDesign) {
      for (const cabinet of placed) {
        if (!shouldRenderSavedSceneCabinet(cabinet, placed)) continue;
        const baseSku = existingCabinetSku(cabinet);
        const sku = {
          ...baseSku,
          catalogImageUrl: resolvedPlacedCabinetFrontVisual(cabinet, cabinetFrontVisuals, baseSku.catalogImageUrl),
        };
        const cabinetFinish = resolvedPlacedCabinetFinish(cabinet, cabinetFinishOverrides, finish);
        const cabinetDoorProfile = resolvedPlacedCabinetDoorProfile(cabinet, cabinetDoorProfiles, resolvedDoorProfile);
        const cabinetDoorTexture = resolvedPlacedCabinetDoorSampleUrl(cabinet, cabinetDoorSampleUrls, catalogDoorSampleUrl, renderExistingDesign);
        const transform = /^HOOD[-_]?/i.test(cabinet.masterCode ?? "")
          ? savedRangeHoodTransform(cabinet, placed, room)
          : existingCabinetTransform(cabinet, room);
        addCabinet(catalogRoot, sku, null, cursor, room.width, room.depth, cabinetFinish, materialDefaults.countertop, cabinetDoorProfile ?? undefined, transform, cabinetDoorTexture, updateDoorTextureState);
      }
    } else {
      for (const suggestion of validSuggestions) {
        if (!suggestion.sku) continue;
        addCabinet(catalogRoot, suggestion.sku, suggestion.zone.wallKey, cursor, room.width, room.depth, finish, materialDefaults.countertop, resolvedDoorProfile ?? undefined, undefined, activeDoorTexture, updateDoorTextureState);
      }
    }
    for (const opening of openings) addWallOpening(catalogRoot, opening, room.width, room.depth);
    for (const sink of sinks) addSinkFixture(catalogRoot, sink);
    if (island) addIslandZone(catalogRoot, island, materialDefaults.countertop);
    for (const ponyWall of ponyWalls) addPonyWall(catalogRoot, ponyWall);
    for (const furnitureItem of furniture) addFurniture(catalogRoot, furnitureItem);
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
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      cameraViewRef.current = {
        preset: cameraPreset,
        resetKey,
        position: camera.position.clone(),
        target: controls.target.clone(),
        zoom: camera.zoom,
      };
      controls.dispose();
      disposeObject(threeScene);
      renderer.dispose();
      renderer.domElement.remove();
      if (rendererRef.current === renderer) rendererRef.current = null;
      if (sceneRef.current === threeScene) sceneRef.current = null;
      if (cameraRef.current === camera) cameraRef.current = null;
      if (controlsRef.current === controls) controlsRef.current = null;
      if (catalogRootRef.current === catalogRoot) catalogRootRef.current = null;
    };
  }, [scene, validSuggestions, placed, roomOverride, openings, sinks, island, furniture, ponyWalls, renderExistingDesign, autoRotate, resetKey, cameraPreset, showRoomContext, hybridPlanUnderlay, wallHeightIn, wallHeights, resolvedCabinetFinish, cabinetFinishOverrides, cabinetDoorProfiles, cabinetDoorSampleUrls, cabinetFrontVisuals, countertopFinish, cabinetFinish, catalogDoorSampleUrl]);

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

  const captureShareThumbnail = (): string | null => {
    const renderer = rendererRef.current;
    const threeScene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !threeScene || !camera) return null;
    const currentSize = new THREE.Vector2();
    renderer.getSize(currentSize);
    const currentPixelRatio = renderer.getPixelRatio();
    const exportWidth = 640;
    const exportHeight = 360;
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(exportWidth, exportHeight, false);
      camera.aspect = exportWidth / exportHeight;
      camera.updateProjectionMatrix();
      renderer.render(threeScene, camera);
      return renderer.domElement.toDataURL("image/jpeg", 0.82);
    } catch {
      return null;
    } finally {
      renderer.setPixelRatio(currentPixelRatio);
      renderer.setSize(currentSize.x, currentSize.y, false);
      camera.aspect = currentSize.x / currentSize.y;
      camera.updateProjectionMatrix();
    }
  };

  const zoomViewer = (direction: "in" | "out") => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const roomDimensions = roomOverride ?? dimensions(scene.roomShape?.defaultDimensions);
    const maxSpan = Math.max(roomDimensions.width, roomDimensions.depth) * INCH;
    const currentDistance = camera.position.distanceTo(controls.target);
    const nextDistance = threeDViewerZoomDistance(currentDistance, threeDCameraDistanceLimits(maxSpan), direction);
    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 0.000001) return;
    camera.position.copy(controls.target.clone().add(offset.normalize().multiplyScalar(nextDistance)));
    controls.update();
    setAutoRotate(false);
  };

  const panViewer = (direction: "up" | "down" | "left" | "right") => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const step = threeDViewerPanStep(camera.position.distanceTo(controls.target));
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.000001) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    if (right.lengthSq() < 0.000001) right.set(1, 0, 0);
    right.normalize();
    const delta = direction === "up" ? forward.multiplyScalar(step)
      : direction === "down" ? forward.multiplyScalar(-step)
        : direction === "left" ? right.multiplyScalar(-step)
          : right.multiplyScalar(step);
    camera.position.add(delta);
    controls.target.add(delta);
    controls.update();
    setAutoRotate(false);
  };

  const resetViewerNavigation = () => {
    setAutoRotate(false);
    setCameraPreset("presentation");
    setResetKey((current) => current + 1);
  };

  const inspectCabinetAtPoint = (clientX: number, clientY: number) => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const root = catalogRootRef.current;
    if (!renderer || !camera || !root) return null;
    const bounds = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(root.children, true);
    renderer.domElement.style.cursor = hits.length > 0 ? "pointer" : "grab";
    const hitSelection = threeDCabinetHitFromIntersections(hits);
    if (!hitSelection) return null;
    const placedCabinet = hitSelection.uid ? placed.find((cabinet) => cabinet.uid === hitSelection.uid) ?? null : null;
    const selection = {
      ...hitSelection,
      description: placedCabinet?.description ?? hitSelection.description,
    };
    setSelectedCabinet(selection);
    if (selection.uid) onSelectCabinet?.(selection.uid);
    return selection;
  };

  const catalogDropTargetAtPoint = (clientX: number, clientY: number): ThreeDCatalogDropTarget | undefined => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const root = catalogRootRef.current;
    const room = roomOverride ?? dimensions(scene.roomShape?.defaultDimensions);
    if (!renderer || !camera || !room) return undefined;
    const bounds = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const intersections = root ? raycaster.intersectObjects(root.children, true) : [];
    const physicalWallHit = intersections.find((intersection) => threeDRoomWallSideFromObject(intersection.object) != null);
    const targetedWall = physicalWallHit ? threeDRoomWallSideFromObject(physicalWallHit.object) ?? catalogDropWall : catalogDropWall;
    const plane = threeDCatalogDropPlane(targetedWall, room);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return undefined;
    return threeDCatalogDropTargetFromIntersections(intersections, hit, room, targetedWall);
  };

  const requestCabinetMove = (direction: ThreeDCabinetMoveDirection) => {
    if (!selectedCabinet?.uid || !onMoveCabinet) return;
    let planDelta: ThreeDPlanMoveDelta | undefined;
    const selectedPlacedCabinet = placed.find((cabinet) => cabinet.uid === selectedCabinet.uid);
    if ((direction === "left" || direction === "right") && cameraRef.current && selectedPlacedCabinet) {
      const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraRef.current.quaternion);
      const movementRoom = roomOverride ?? dimensions(scene.roomShape?.defaultDimensions);
      planDelta = threeDScreenHorizontalPlanDelta(cabinetWall(selectedPlacedCabinet, movementRoom), direction, moveIncrementIn, cameraRight);
    }
    onMoveCabinet(selectedCabinet.uid, direction, moveIncrementIn, planDelta);
  };

  const clearRightDragGhost = () => {
    const ghost = rightDragGhostRef.current;
    if (!ghost) return;
    ghost.removeFromParent();
    ghost.geometry.dispose();
    const material = ghost.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material.dispose();
    rightDragGhostRef.current = null;
  };

  const updateRightDragGhost = (source: PlacedCabinet, preview: CabinetWallDragPreview | null, room: RoomData) => {
    clearRightDragGhost();
    const candidate = preview?.ghostCandidate ?? preview?.candidate;
    const renderedScene = sceneRef.current;
    if (!candidate || !renderedScene) return;
    const box = threeDWallDragGhostBox(candidate, room);
    const boxGeometry = new THREE.BoxGeometry(box.size.width, box.size.height, box.size.depth);
    const edges = new THREE.EdgesGeometry(boxGeometry);
    boxGeometry.dispose();
    const valid = Boolean(preview?.candidate);
    const material = new THREE.LineBasicMaterial({ color: valid ? 0x059669 : 0xe11d48, transparent: true, opacity: 0.98, depthTest: false });
    const ghost = new THREE.LineSegments(edges, material);
    ghost.position.set(box.position.x, box.position.y, box.position.z);
    ghost.renderOrder = 1000;
    ghost.userData = { rightDragSnapGhost: true, placementUid: source.uid, valid };
    renderedScene.add(ghost);
    rightDragGhostRef.current = ghost;
  };

  const restoreRightDragVisual = (session: NonNullable<typeof rightDragRef.current>) => {
    session.visualOrigins.forEach(({ object, x, z }) => object.position.set(x, object.position.y, z));
  };

  const cabinetWallRunAtPoint = (clientX: number, clientY: number, wall: WallSide): number | null => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const room = roomOverride ?? dimensions(scene.roomShape?.defaultDimensions);
    if (!renderer || !camera || !room) return null;
    const bounds = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(threeDCatalogDropPlane(wall, room), hit)) return null;
    const horizontal = wall === "top" || wall === "bottom";
    return horizontal
      ? Math.max(0, Math.min(room.width, hit.x / INCH))
      : Math.max(0, Math.min(room.depth, hit.z / INCH));
  };

  const handleRoomPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY, button: event.button };
    if (event.button !== 2 || !onMoveCabinetTo) return;
    const selection = inspectCabinetAtPoint(event.clientX, event.clientY);
    const source = selection?.uid ? placed.find((cabinet) => cabinet.uid === selection.uid) ?? null : null;
    const movementRoom = roomOverride ?? dimensions(scene.roomShape?.defaultDimensions);
    if (!source || !isWallRunDraggable(source, movementRoom)) return;
    const visualOrigins = (catalogRootRef.current?.children ?? [])
      .filter((object) => threeDCabinetHitFromObject(object)?.uid === source.uid)
      .map((object) => ({ object, x: object.position.x, z: object.position.z }));
    rightDragRef.current = { pointerId: event.pointerId, uid: source.uid, source, startX: event.clientX, startY: event.clientY, active: false, preview: null, visualOrigins };
    if (controlsRef.current) controlsRef.current.enabled = false;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional on older browsers. */ }
    event.preventDefault();
  };

  const handleRoomPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = rightDragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const travelPx = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
    if (threeDRightPointerGesture(2, travelPx, true) !== "drag") return;
    session.active = true;
    event.preventDefault();
    event.stopPropagation();
    const room = roomOverride ?? dimensions(scene.roomShape?.defaultDimensions);
    const wall = cabinetWall(session.source, room);
    const targetAlong = cabinetWallRunAtPoint(event.clientX, event.clientY, wall);
    restoreRightDragVisual(session);
    if (targetAlong == null) {
      session.preview = null;
      setCabinetDragMeasurement(null);
      clearRightDragGhost();
      return;
    }
    const preview = cabinetWallDragPreview(session.source, room, placed, openings, targetAlong);
    session.preview = preview;
    setCabinetDragMeasurement(preview ? { cabinet: session.source, preview } : null);
    updateRightDragGhost(session.source, preview, room);
  };

  const finishRightDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false): boolean => {
    const session = rightDragRef.current;
    if (!session || session.pointerId !== event.pointerId) return false;
    restoreRightDragVisual(session);
    clearRightDragGhost();
    if (controlsRef.current) controlsRef.current.enabled = true;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Pointer capture may already be released. */ }
    rightDragRef.current = null;
    setCabinetDragMeasurement(null);
    if (!session.active) return false;
    suppressContextMenuRef.current = true;
    window.setTimeout(() => { suppressContextMenuRef.current = false; }, 0);
    event.preventDefault();
    event.stopPropagation();
    if (!cancelled && session.preview?.candidate) {
      onMoveCabinetTo?.(session.uid, session.preview.candidate.x, session.preview.candidate.y);
    } else if (!cancelled) {
      toast.error(session.preview ? threeDCabinetWallDragText(session.source, session.preview) : `${session.source.masterCode} has no valid same-wall snap at this position.`);
    }
    return true;
  };

  const handleRoomPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (finishRightDrag(event)) return;
    if (start?.button === 2) return;
    const travelPx = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) : Number.POSITIVE_INFINITY;
    if (threeDPointerSelectsCabinet("up", travelPx)) {
      inspectCabinetAtPoint(event.clientX, event.clientY);
      setMovePanelOpen(false);
    }
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

  const shareUrl = async (url: string, text: string) => {
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
        toast.success("Link copied to clipboard.");
      } catch {
        // Native sharing remains available on devices where clipboard permission is denied.
      }
    }
    if (navigator.share) {
      await navigator.share({ title: "Cabinet Dealz 3D Room", text, url });
    } else if (!copied) {
      throw new Error("Clipboard access is unavailable.");
    }
  };

  const shareConfiguration = async (cameraView?: ThreeDCameraShareView) => {
    if (!shareContext || !roomOverride) {
      toast.error("Add your room and choose an active catalog door style before sharing.");
      return;
    }
    try {
      const thumbnailDataUrl = cameraView ? captureShareThumbnail() ?? undefined : undefined;
      const { token } = await shareMutation.mutateAsync({
        ...shareContext,
        room: { ...roomOverride },
        placed,
        openings,
        sinks,
        presentation: { cabinetFinish, countertopFinish },
        orderSummary,
        thumbnailDataUrl,
      });
      const url = new URL(`/3d/${token}`, window.location.origin);
      const serializedView = cameraView ? serializeThreeDCameraShareView(cameraView) : "";
      if (serializedView) url.searchParams.set(THREE_D_CAMERA_VIEW_QUERY_PARAM, serializedView);
      await shareUrl(url.toString(), cameraView ? "View this Cabinet Dealz 3D room from the shared inspection perspective." : "View this Cabinet Dealz 3D room configuration.");
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") toast.error("Could not create the share link. Please try again.");
    }
  };

  const shareCurrentView = async () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      toast.error("The 3D view is still loading. Please try Share View again in a moment.");
      return;
    }
    const cameraView = { position: camera.position.clone(), target: controls.target.clone(), zoom: camera.zoom };
    const thumbnailDataUrl = captureShareThumbnail();
    if (window.location.pathname.startsWith("/3d/")) {
      try {
        const url = new URL(window.location.href);
        const serializedView = serializeThreeDCameraShareView(cameraView);
        if (!serializedView) throw new Error("The current view could not be encoded.");
        const token = window.location.pathname.split("/").filter(Boolean).at(-1);
        if (thumbnailDataUrl && token) {
          await shareThumbnailMutation.mutateAsync({ token, thumbnailDataUrl });
        }
        url.searchParams.set(THREE_D_CAMERA_VIEW_QUERY_PARAM, serializedView);
        await shareUrl(url.toString(), "View this Cabinet Dealz 3D room from the shared inspection perspective.");
      } catch (error) {
        if ((error as DOMException)?.name !== "AbortError") toast.error("Could not create the Share View link. Please try again.");
      }
      return;
    }
    await shareConfiguration(cameraView);
  };

  if (!scene.roomShape && !roomOverride) {
    return <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 text-center text-sm text-muted-foreground">Choose a room layout or open a saved design to generate the deterministic 3D preview.</div>;
  }
  if (webglUnavailable) {
    return <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 text-center text-sm text-muted-foreground">This device cannot start the interactive 3D view. Your 2D plan and elevation preview remain available.</div>;
  }
  const fittedFillerLabels = placed
    .map((cabinet) => ({ uid: cabinet.uid, masterCode: cabinet.masterCode, text: threeDFittedFillerWidthText(cabinet) }))
    .filter((label): label is { uid: string; masterCode: string; text: string } => label.text != null);

  const temporaryPreviewCounterText = threeDTemporaryPreviewCounterText(temporaryPreviewCounter);

  return (
    <section ref={previewRootRef} onDragOver={(event) => event.preventDefault()} className={`relative ${embedded ? "flex h-full min-h-0 flex-col" : ""} ${isFullscreen ? "h-screen w-screen overflow-y-auto bg-background p-3 sm:p-5" : ""} ${className ?? ""}`} aria-label="Interactive three-dimensional room preview">
	  {temporaryPreviewMessage && <div data-testid="three-d-temporary-preview" className="absolute left-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs font-semibold text-amber-900 shadow-sm backdrop-blur"><span>{temporaryPreviewMessage}</span>{temporaryPreviewCounterText && <span data-testid="three-d-temporary-preview-counter" className="shrink-0 rounded-full border border-amber-400 bg-white px-2 py-1 text-[11px] font-bold text-amber-900">{temporaryPreviewCounterText}</span>}{onClearTemporaryPreview && <button type="button" onClick={onClearTemporaryPreview} className="rounded border border-amber-400 bg-white px-2 py-1 text-[11px] font-bold text-amber-900 active:scale-95">Clear preview</button>}</div>}
      {!embedded && <div className="sticky top-0 z-30 mb-2 flex items-center justify-between gap-3 border-b bg-background/95 py-2 backdrop-blur">
        <div className="min-w-0"><p className="text-sm font-semibold">3D Designer</p><p className="truncate text-[11px] text-muted-foreground">{renderExistingDesign ? `${placed.length} cabinets · synchronized with your plan` : "Start placing catalog cabinets"}</p></div>
        <div className="flex shrink-0 gap-1"><Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={toggleFullscreen}>{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button><Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setResetKey((current) => current + 1)}><Camera className="h-4 w-4" /></Button></div>
      </div>}
      <div className={`relative overflow-hidden rounded-xl border bg-[#f6f3ed] shadow-inner transition-opacity duration-300 touch-none ${embedded ? "min-h-[300px] flex-1" : isFullscreen ? "h-[calc(100vh-9rem)] min-h-[480px]" : "h-[58dvh] min-h-[400px] sm:h-[62vh]"} ${materialTransitioning ? "opacity-75" : "opacity-100"}`} onPointerDown={handleRoomPointerDown} onPointerMove={handleRoomPointerMove} onPointerUp={handleRoomPointerUp} onPointerCancel={(event) => { pointerStartRef.current = null; finishRightDrag(event, true); }} onContextMenu={(event) => { event.preventDefault(); if (suppressContextMenuRef.current || rightDragRef.current?.active) { suppressContextMenuRef.current = false; return; } const selection = inspectCabinetAtPoint(event.clientX, event.clientY); if (selection?.uid && onOpenCabinetEditor) { setMovePanelOpen(false); onOpenCabinetEditor(selection.uid); return; } setMovePanelOpen(Boolean(selection?.uid && onMoveCabinet)); }} onDragOver={(event) => {
        event.preventDefault();
        const key = event.dataTransfer.getData("text/plain") || draggedCatalogId || "";
        const item = catalogItems.find((candidate) => `${candidate.category}:${candidate.id}` === key) ?? catalogDragItem;
        if (!item || !roomOverride || !item.width || item.width <= 0) { setCatalogDragMeasurement(null); return; }
        const target = catalogDropTargetAtPoint(event.clientX, event.clientY);
        const wall = target?.wall ?? catalogDropWall;
        if (!target || !wall) { setCatalogDragMeasurement(null); return; }
        const layer = item.placement === "wall" ? "wall" : "base";
        const gaps = wallGaps(roomOverride, placed, openings, 0.5).filter((gap) => gap.side === wall && gap.layer === layer);
        const targetAlong = wall === "top" || wall === "bottom" ? target.x : target.y;
        const fit = wallGapFitPreview(gaps, targetAlong, item.width);
        setCatalogDragMeasurement(fit ? { item, fit, wall } : null);
      }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCatalogDragMeasurement(null); }} onDrop={(event) => { event.preventDefault(); const key = event.dataTransfer.getData("text/plain"); const item = catalogItems.find((candidate) => `${candidate.category}:${candidate.id}` === key) ?? catalogDragItem; if (item) onAddCatalogItem?.(item, catalogDropTargetAtPoint(event.clientX, event.clientY)); setDraggedCatalogId(null); setCatalogDragMeasurement(null); }}>
		        <div ref={mountRef} className="h-full w-full" />
		        {cabinetDragMeasurement && <div data-testid="three-d-cabinet-drag-highlight" aria-hidden="true" className={`pointer-events-none absolute inset-1 z-20 rounded-xl border-4 transition-colors ${cabinetDragMeasurement.preview.candidate ? "border-emerald-500 shadow-[inset_0_0_32px_rgba(16,185,129,0.2)]" : "border-rose-500 shadow-[inset_0_0_32px_rgba(244,63,94,0.2)]"}`} />}
		        {cabinetDragMeasurement && <div data-testid="three-d-cabinet-drag-measurement" role="status" aria-live="polite" className={`pointer-events-none absolute left-3 top-14 z-30 max-w-[calc(100%-1.5rem)] rounded-lg border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur ${cabinetDragMeasurement.preview.candidate ? "border-emerald-600 bg-emerald-50/95 text-emerald-950" : "border-rose-600 bg-rose-50/95 text-rose-950"}`}><span className="block text-[10px] font-bold uppercase tracking-wide">{cabinetDragMeasurement.preview.candidate ? "Valid zero-gap snap" : "Invalid cabinet position"} · {cabinetDragMeasurement.preview.wall} wall · ⅛&quot; precision</span><span>{threeDCabinetWallDragText(cabinetDragMeasurement.cabinet, cabinetDragMeasurement.preview)}</span></div>}
		        {catalogDragMeasurement && <div data-testid="three-d-catalog-drag-highlight" aria-hidden="true" className={`pointer-events-none absolute inset-1 z-20 rounded-xl border-4 transition-colors ${catalogDragMeasurement.fit.status === "valid" ? "border-emerald-500 shadow-[inset_0_0_32px_rgba(16,185,129,0.2)]" : "border-rose-500 shadow-[inset_0_0_32px_rgba(244,63,94,0.2)]"}`} />}
		        {catalogDragMeasurement && <div data-testid="three-d-catalog-drag-measurement" role="status" aria-live="polite" className={`pointer-events-none absolute left-3 top-14 z-30 max-w-[calc(100%-1.5rem)] rounded-lg border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur ${catalogDragMeasurement.fit.status === "valid" ? "border-emerald-600 bg-emerald-50/95 text-emerald-950" : "border-rose-600 bg-rose-50/95 text-rose-950"}`}><span className="block text-[10px] font-bold uppercase tracking-wide">{catalogDragMeasurement.fit.status === "valid" ? "Valid snap space" : "Invalid drop space"} · {catalogDragMeasurement.wall} wall · ⅛&quot; precision</span><span>{threeDCatalogDragFitText(catalogDragMeasurement.item, catalogDragMeasurement.fit)}</span></div>}
		        {hybridPlanUnderlay && <div data-testid="three-d-plan-underlay-badge" className="pointer-events-none absolute left-3 top-3 z-20 rounded-md border border-[#d9c196] bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold text-[#634b20] shadow-sm backdrop-blur">3D over plan · same placement rules</div>}
	        {temporaryPreviewMessage && <div data-testid="three-d-preview-fade" aria-hidden="true" className={`pointer-events-none absolute inset-0 z-10 bg-background transition-opacity duration-200 motion-reduce:hidden ${temporaryPreviewFading ? "opacity-40" : "opacity-0"}`} />}
	        {embedded && <div className={THREE_D_EMBEDDED_TOOLBAR_CLASS} onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}><button type="button" data-testid="three-d-add-cabinet" onClick={() => setWorkspacePanel("catalog")} className="inline-flex items-center gap-1.5 rounded-md bg-[#1a2744] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1a2744]/85 active:scale-95"><Plus className="h-3.5 w-3.5" />Add cabinet</button><button type="button" data-testid="three-d-wall-heights" onClick={() => setWorkspacePanel("room")} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold text-[#1a2744] transition hover:bg-muted active:scale-95" aria-label="Set individual wall heights"><Rotate3D className="h-3.5 w-3.5" /><span className="hidden sm:inline">Wall heights</span><span className="sm:hidden">Walls</span></button>{onToggleWallLayer && <button type="button" data-testid="three-d-toggle-wall-cabinets" onClick={onToggleWallLayer} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold text-[#1a2744] transition hover:bg-muted active:scale-95" aria-pressed={showWallLayer}><PanelTop className="h-3.5 w-3.5" /><span className="hidden sm:inline">{showWallLayer ? "Hide wall cabinets" : "Show wall cabinets"}</span><span className="sm:hidden">{showWallLayer ? "Hide walls" : "Show walls"}</span></button>}</div>}
	        {fittedFillerLabels.length > 0 && <div data-testid="three-d-fitted-filler-labels" className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-10rem)] rounded-lg border border-[#d9c196] bg-[#fffaf1]/95 px-2.5 py-2 text-xs shadow-sm backdrop-blur"><p className="font-semibold text-[#634b20]">Fitted fillers</p>{fittedFillerLabels.map((label) => <p key={label.uid} className="mt-0.5 truncate font-medium text-[#765416]">{label.masterCode} · {label.text}</p>)}</div>}
	        {materialTransitioning && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/25 backdrop-blur-[1px]"><span className="inline-flex items-center gap-2 rounded-full bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm"><LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#a87f33]" />Updating preview</span></div>}
        {renderExistingDesign && rangeHoodStatus.needs2DPlacement && <div data-testid="three-d-range-hood-status" className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow-sm backdrop-blur"><span>Add a range hood in the catalog to show it above this saved range.</span>{onAddRangeHood && <button type="button" onClick={onAddRangeHood} className="ml-1 font-semibold underline underline-offset-2">Add now</button>}</div>}
        {selectedCabinet && (() => {
	          const line = threeDOrderLineForSelectedCabinet(orderLines, selectedCabinet);
          const description = threeDSelectedCabinetDescription(selectedCabinet);
          const selectedPlacedCabinet = selectedCabinet.uid ? placed.find((cabinet) => cabinet.uid === selectedCabinet.uid) ?? null : null;
          const adminConfigHref = selectedPlacedCabinet ? cabinetConfigHref?.(selectedPlacedCabinet) ?? null : null;
          const selectedWall = selectedPlacedCabinet && roomOverride ? cabinetWall(selectedPlacedCabinet, roomOverride) : null;
	          const wallFit = selectedPlacedCabinet && roomOverride && selectedWall
	            ? wallCabinetFitMeasure(selectedPlacedCabinet, roomOverride, placed, openings, selectedWall)
	            : null;
	          const wallFitText = threeDWallFitGuideText(wallFit);
	          const fittedFillerWidthText = selectedPlacedCabinet ? threeDFittedFillerWidthText(selectedPlacedCabinet) : null;
          const dpadClearanceClass = threeDSelectedCabinetCardClearanceClass(Boolean(selectedCabinet.uid && onMoveCabinet));
          return <div data-testid="three-d-cabinet-attributes" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} className={`absolute bottom-3 left-3 max-w-[calc(100%-9rem)] sm:bottom-32 sm:left-auto sm:right-3 sm:max-w-[calc(100%-1.5rem)] rounded-lg border bg-background/95 p-3 text-xs shadow-lg backdrop-blur ${dpadClearanceClass}`}>
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#a87f33]" />
              <div className="min-w-0">
                <p className="font-semibold">{selectedCabinet.masterCode}</p>
                <p data-testid="three-d-cabinet-description" className="text-muted-foreground">{description}</p>
                <p className="mt-1">{scene.materials?.cabinet.doorStyle ?? "Catalog"} · {scene.materials?.cabinet.doorPanelType ?? "panel"}</p>
	                <p className="font-medium">{line?.lineTotal == null ? "Catalog price pending" : `Current line price: $${line.lineTotal.toFixed(2)}`}</p>
	                {fittedFillerWidthText && <p data-testid="three-d-fitted-filler-width" className="mt-1 rounded-md border border-[#d9c196] bg-[#fffaf1] px-2 py-1 font-semibold text-[#634b20]">{fittedFillerWidthText}</p>}
		                {wallFitText && <div data-testid="three-d-active-wall-clearance" role="status" aria-live="polite" className={`mt-1 rounded-md border px-2 py-1.5 font-medium ${!wallFit?.seated ? "border-amber-300 bg-amber-50 text-amber-900" : wallFit.status === "fits" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-rose-300 bg-rose-50 text-rose-900"}`}><span className="block text-[10px] font-bold uppercase tracking-wide">Live placement measurement · ⅛&quot; precision</span><span>{wallFitText}</span></div>}
                {selectedCabinet.uid && <div className="mt-2 flex flex-wrap gap-2">
                  {onOpenCabinetEditor && <button type="button" data-testid="three-d-edit-cabinet" onClick={() => onOpenCabinetEditor(selectedCabinet.uid!)} className="rounded-md bg-[#1a2744] px-2.5 py-1.5 font-semibold text-white shadow-sm transition hover:bg-[#1a2744]/85 active:scale-95">Cabinet attributes</button>}
                  {onOpenCabinetEditor && <button type="button" data-testid="three-d-end-panel-treatment" onClick={() => onOpenCabinetEditor(selectedCabinet.uid!)} className="rounded-md border border-[#8a651f]/30 bg-amber-50 px-2.5 py-1.5 font-semibold text-[#765416] transition hover:bg-amber-100 active:scale-95">End panels</button>}
                  {adminConfigHref && <a data-testid="three-d-admin-edit-config" href={adminConfigHref} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-95">Admin: Edit Config ↗</a>}
                  {onRemoveCabinet && <button type="button" data-testid="three-d-remove-cabinet" onClick={() => { onRemoveCabinet(selectedCabinet.uid!); setSelectedCabinet(null); setMovePanelOpen(false); }} className="inline-flex items-center gap-1 font-medium text-red-700 underline-offset-4 hover:underline"><Trash2 className="h-3 w-3" />Remove</button>}
                </div>}
              </div>
              <button type="button" aria-label="Close cabinet attributes" onClick={() => { setSelectedCabinet(null); setMovePanelOpen(false); }} className="text-muted-foreground hover:text-foreground">×</button>
            </div>
          </div>;
        })()}
        {selectedCabinet?.uid && onMoveCabinet && <div data-testid="three-d-selected-cabinet-dpad" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} className="absolute bottom-3 left-3 z-10 flex items-end gap-2">
          <div className="flex flex-col items-center gap-0.5">
            <button data-testid="three-d-move-up" type="button" onClick={() => requestCabinetMove("up")} className="flex h-9 w-9 items-center justify-center rounded-t-lg border border-border bg-white/90 shadow-sm transition-transform hover:bg-white active:scale-95" title={`Move up ${moveIncrementIn === 1 ? '1"' : '¼"'}`}><ArrowUp className="h-4 w-4 text-[#1a2744]" /></button>
            <div className="flex gap-0.5"><button data-testid="three-d-move-left" type="button" onClick={() => requestCabinetMove("left")} className="flex h-9 w-9 items-center justify-center rounded-l-lg border border-border bg-white/90 shadow-sm transition-transform hover:bg-white active:scale-95"><ArrowLeft className="h-4 w-4 text-[#1a2744]" /></button><button type="button" onClick={() => onRotateCabinet?.(selectedCabinet.uid!)} className="flex h-9 w-9 items-center justify-center rounded-sm border border-[#1a2744] bg-[#1a2744] shadow-sm transition-transform hover:bg-[#1a2744]/80 active:scale-95" title="Rotate 90 degrees"><Rotate3D className="h-4 w-4 text-white" /></button><button data-testid="three-d-move-right" type="button" onClick={() => requestCabinetMove("right")} className="flex h-9 w-9 items-center justify-center rounded-r-lg border border-border bg-white/90 shadow-sm transition-transform hover:bg-white active:scale-95"><ArrowRight className="h-4 w-4 text-[#1a2744]" /></button></div>
            <button data-testid="three-d-move-down" type="button" onClick={() => requestCabinetMove("down")} className="flex h-9 w-9 items-center justify-center rounded-b-lg border border-border bg-white/90 shadow-sm transition-transform hover:bg-white active:scale-95" title={`Move down ${moveIncrementIn === 1 ? '1"' : '¼"'}`}><ArrowDown className="h-4 w-4 text-[#1a2744]" /></button>
          </div>
          <button type="button" onClick={() => setMoveIncrementIn((current) => current === 1 ? 0.25 : 1)} className={`rounded-md border px-2 py-1.5 text-[11px] font-bold shadow-sm ${moveIncrementIn === 0.25 ? "border-amber-400 bg-amber-100 text-amber-800" : "border-border bg-white/90 text-[#1a2744]"}`} title="Toggle move step">{moveIncrementIn === 1 ? '1"' : '¼"'}</button>
        </div>}
        <div data-testid="three-d-viewer-navigation" aria-label="3D viewer zoom and pan controls" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} className="absolute bottom-3 right-3 z-20 flex flex-col items-center gap-1 rounded-lg border border-slate-300 bg-white/95 p-1.5 shadow-lg backdrop-blur">
          <div className="flex gap-1"><button data-testid="three-d-zoom-in" type="button" onClick={() => zoomViewer("in")} aria-label="Zoom in for a closer cabinet view" title="Zoom in" className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-[#1a2744] transition hover:bg-slate-50 active:scale-95"><Plus className="h-4 w-4" /></button><button data-testid="three-d-zoom-out" type="button" onClick={() => zoomViewer("out")} aria-label="Zoom out for a wider room view" title="Zoom out" className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-[#1a2744] transition hover:bg-slate-50 active:scale-95"><Minus className="h-4 w-4" /></button><button data-testid="three-d-reset-view" type="button" onClick={resetViewerNavigation} aria-label="Reset 3D room view" title="Reset view" className="flex h-9 w-9 items-center justify-center rounded-md border border-[#a87f33]/50 bg-[#fffaf1] text-[#765416] transition hover:bg-amber-100 active:scale-95"><RefreshCw className="h-4 w-4" /></button></div>
          <button data-testid="three-d-share-view" type="button" onClick={() => void shareCurrentView()} aria-label="Share the current 3D zoom and pan perspective" title="Share current view" className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-md border border-[#a87f33]/45 bg-[#fffaf1] px-2 text-[11px] font-semibold text-[#765416] transition hover:bg-amber-100 active:scale-95"><Share2 className="h-3.5 w-3.5" />Share View</button>
          <div className="grid grid-cols-3 gap-1" aria-label="Pan the 3D room view"><span /><button data-testid="three-d-pan-up" type="button" onClick={() => panViewer("up")} aria-label="Pan view up" title="Pan up" className="flex h-8 w-8 items-center justify-center rounded-t-md border border-slate-300 bg-white text-[#1a2744] transition hover:bg-slate-50 active:scale-95"><ArrowUp className="h-4 w-4" /></button><span /><button data-testid="three-d-pan-left" type="button" onClick={() => panViewer("left")} aria-label="Pan view left" title="Pan left" className="flex h-8 w-8 items-center justify-center rounded-l-md border border-slate-300 bg-white text-[#1a2744] transition hover:bg-slate-50 active:scale-95"><ArrowLeft className="h-4 w-4" /></button><span className="flex h-8 w-8 items-center justify-center text-[9px] font-bold text-slate-500">PAN</span><button data-testid="three-d-pan-right" type="button" onClick={() => panViewer("right")} aria-label="Pan view right" title="Pan right" className="flex h-8 w-8 items-center justify-center rounded-r-md border border-slate-300 bg-white text-[#1a2744] transition hover:bg-slate-50 active:scale-95"><ArrowRight className="h-4 w-4" /></button><span /><button data-testid="three-d-pan-down" type="button" onClick={() => panViewer("down")} aria-label="Pan view down" title="Pan down" className="flex h-8 w-8 items-center justify-center rounded-b-md border border-slate-300 bg-white text-[#1a2744] transition hover:bg-slate-50 active:scale-95"><ArrowDown className="h-4 w-4" /></button><span /></div>
        </div>
      </div>
      {!embedded && <>
        <div className="mt-2 flex snap-x gap-2 overflow-x-auto border-t pt-2" aria-label="3D designer action bar">
          <Button type="button" size="sm" variant="outline" className="h-10 shrink-0 snap-start gap-1.5" onClick={() => setWorkspacePanel("catalog")}><Move3D className="h-4 w-4" />Catalog{catalogItems.length ? ` (${catalogItems.length})` : ""}</Button>
          <Button type="button" size="sm" variant="outline" className="h-10 shrink-0 snap-start gap-1.5" onClick={() => setWorkspacePanel("view")}><Camera className="h-4 w-4" />View</Button>
          <Button type="button" size="sm" variant="outline" className="h-10 shrink-0 snap-start gap-1.5" onClick={() => setWorkspacePanel("finish")}><Sparkles className="h-4 w-4" />Finish</Button>
          <Button type="button" size="sm" variant="outline" className="h-10 shrink-0 snap-start gap-1.5" onClick={() => setWorkspacePanel("room")}><Rotate3D className="h-4 w-4" />Room</Button>
          <Button type="button" size="sm" variant="outline" className="h-10 shrink-0 snap-start gap-1.5" onClick={() => setWorkspacePanel("output")}><Share2 className="h-4 w-4" />Output</Button>
          {orderSummary && <Button type="button" size="sm" className="h-10 shrink-0 snap-start" onClick={() => setPricingOpen(true)}>${orderSummary.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Button>}
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">Tap a cabinet to edit or move it · Drag to orbit · Pinch or scroll to zoom</p>
      </>}
      <Sheet open={workspacePanel !== null} onOpenChange={(open) => { if (!open) setWorkspacePanel(null); }}>
        <SheetContent side="bottom" className="max-h-[78dvh] overflow-y-auto rounded-t-2xl px-4 pb-6 sm:mx-auto sm:max-w-3xl">
          {workspacePanel === "catalog" && <>
            <SheetHeader><SheetTitle>Add from catalog</SheetTitle></SheetHeader>
            <p className="mt-2 text-sm text-muted-foreground">Browse the complete active cabinet catalog, then add an item to the active wall. It immediately joins this 3D room and the saved 2D plan.</p>
            <div className="mt-4 flex gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1" aria-label="3D catalog categories">{THREE_D_CATALOG_GROUPS.map((group) => <button key={group} type="button" onClick={() => setCatalogGroup(group)} className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${catalogGroup === group ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}>{group}</button>)}</div>
            <Input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Search cabinet name or code" className="mt-4" aria-label="Search 3D catalog" />
            <p className="mt-2 text-xs text-muted-foreground">{visibleCatalogItems.length} matching items</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {visibleCatalogItems.map((item) => <button key={`${item.category}-${item.id}`} type="button" draggable onDragStart={(event) => { const key = `${item.category}:${item.id}`; event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("text/plain", key); setDraggedCatalogId(key); }} onDragEnd={() => setDraggedCatalogId(null)} onClick={() => { onAddCatalogItem?.(item); setWorkspacePanel(null); }} className="rounded-xl border bg-card p-3 text-left transition hover:border-[#a87f33] hover:bg-[#fffaf1]">
                <span className="block font-semibold">{item.masterCode}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.description ?? item.category}</span><span className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-[#a87f33]">Add {item.category}</span>
              </button>) || <p className="col-span-full rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No matching catalog items.</p>}
            </div>
          </>}
          {workspacePanel === "view" && <>
            <SheetHeader><SheetTitle>3D view</SheetTitle></SheetHeader>
            <div className="mt-4 flex flex-wrap gap-2" aria-label="3D camera presets">{([ ["presentation", "Perspective"], ["front", "Front"], ["wide", "Wide"], ["detail", "Detail"] ] as const).map(([preset, label]) => <Button key={preset} type="button" variant={cameraPreset === preset ? "default" : "outline"} onClick={() => { setCameraPreset(preset); setWorkspacePanel(null); }}>{label}</Button>)}</div>
            <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setShowRoomContext((current) => !current)}>{showRoomContext ? "Clear stage" : "Room context"}</Button><Button type="button" variant="outline" onClick={() => setAutoRotate((current) => !current)}><Rotate3D className="mr-1.5 h-4 w-4" />{autoRotate ? "Pause rotation" : "Rotate room"}</Button><Button type="button" variant="outline" onClick={toggleFullscreen}>{isFullscreen ? "Exit full screen" : "Full screen"}</Button></div>
          </>}
          {workspacePanel === "finish" && <>
            <SheetHeader><SheetTitle>Preview finish</SheetTitle></SheetHeader>
            <p className="mt-2 text-sm text-muted-foreground">Cabinet finishes are always taken from the active 2D catalog selection. Generic preview cabinet colors are not offered here.</p>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#d9c196] bg-[#fffaf1] p-3"><span className="h-8 w-8 rounded-full border border-black/10" style={{ backgroundColor: catalogFinish }} /><div><p className="text-xs font-semibold text-[#4b3a20]">Active cabinet finish</p><p className="text-sm font-semibold text-[#382710]">{cabinetFinishLabel}</p></div></div>
            <p className="mt-5 text-xs font-semibold">Countertop preview</p><div className="mt-2 flex flex-wrap gap-2">{COUNTERTOP_FINISHES.map((option) => <button key={option.name} type="button" onClick={() => setCountertopFinish(option.color)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs ${countertopFinish === option.color ? "border-[#a87f33] bg-[#fff7e8]" : "border-border bg-background"}`}><span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: option.color }} />{option.name}</button>)}</div>
          </>}
          {workspacePanel === "room" && <>
            <SheetHeader><SheetTitle>Room controls</SheetTitle></SheetHeader>
            <label data-testid="three-d-wall-height-control" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#a87f33]/60 bg-[#fffaf1] p-3 text-sm font-semibold text-[#4b3a20]"><span>All wall height</span><span className="flex items-center gap-1"><Input aria-label="3D wall height in inches" type="number" min={1} max={120} step={1} value={wallHeightIn} onChange={(event) => updateWallHeight(event.target.value)} className="h-9 w-16 border border-[#d9c196] bg-background text-center font-semibold shadow-none" />in</span></label>
            <div data-testid="three-d-per-wall-height-controls" className="mt-3 grid grid-cols-2 gap-2" aria-label="Individual wall heights">{([ ["top", "Back"], ["left", "Left"], ["right", "Right"], ["bottom", "Front"] ] as const).map(([side, label]) => <label key={side} className={`flex items-center justify-between rounded-lg border p-2 text-xs font-semibold ${wallHeights[side] < (upperCabinetWallMinimums[side] ?? 0) ? "border-amber-300 bg-amber-50 text-amber-900" : ""}`}><span>{label}</span><Input aria-label={`${label} wall height in inches`} type="number" min={1} max={120} step={1} value={wallHeights[side]} onChange={(event) => updateWallHeightForSide(side, event.target.value)} className="h-8 w-14 text-center text-xs" /></label>)}</div>
          </>}
          {workspacePanel === "output" && <>
            <SheetHeader><SheetTitle>Save, quote & share</SheetTitle></SheetHeader>
            {orderSummary && <div className="mt-4 flex items-center justify-between rounded-xl border border-[#d9c196] bg-[#fffaf1] p-3"><div><p className="text-sm font-semibold text-[#4b3a20]">Current design</p><p className="text-xs text-[#6e5d42]">{orderSummary.itemCount} items · {orderSummary.pricedLineCount} priced lines</p></div><p className="text-lg font-semibold text-[#382710]">${orderSummary.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3"><Button type="button" variant="outline" onClick={downloadImage}><Download className="mr-1.5 h-4 w-4" />Image</Button><Button type="button" variant="outline" onClick={exportPdf}><FileDown className="mr-1.5 h-4 w-4" />PDF</Button><Button type="button" variant="outline" onClick={printPdf}><Printer className="mr-1.5 h-4 w-4" />Print</Button><Button type="button" variant="outline" onClick={emailPdf} disabled={emailQuoteMutation.isPending || !orderSummary}><Mail className="mr-1.5 h-4 w-4" />Email</Button>{onSaveToAccount && <Button type="button" variant="outline" onClick={onSaveToAccount}><Save className="mr-1.5 h-4 w-4" />Save</Button>}{onSyncCart && <Button type="button" variant="outline" onClick={() => { onSyncCart(); setWorkspacePanel(null); }} disabled={!canSyncThreeDOrderToCart(orderLines)}><RefreshCw className="mr-1.5 h-4 w-4" />Sync cart</Button>}<Button type="button" onClick={() => void shareConfiguration()} disabled={!shareContext || !roomOverride || shareMutation.isPending}><Share2 className="mr-1.5 h-4 w-4" />Share</Button></div>
          </>}
        </SheetContent>
      </Sheet>
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
