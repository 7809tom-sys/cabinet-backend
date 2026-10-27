/**
 * Turns one saved design into forecast lines. Quantity math is the designer's
 * own takeoff: toeKickLinearInches, trimPiecesNeeded, crownTakeoffFromExposedSegments
 * (4" per exposed miter cut), countertopArea, and countertopSlabSquareFeet.
 * Crown is included only when saved trimSettings.crown is true. Toe kick is
 * estimated when trim settings were never saved. Missing style, color, or
 * series becomes "unspecified". A line with no resolvable vendor scope is
 * unassigned and is not shown to any vendor.
 */

import {
  adjacentCabinetForFiller,
  countertopArea,
  DEFAULT_ROOM,
  isFillerItem,
  toeKickLinearInches,
  trimPiecesNeeded,
  type PlacedCabinet,
  type RoomData,
} from "../../client/src/lib/design";
import { crownTakeoffFromExposedSegments, type CrownTakeoffSegment } from "../../client/src/lib/crownTakeoff";
import { countertopSlabSquareFeet } from "../../client/src/lib/surfaceCartLines";
import { distributorScope, PELICAN_SCOPE, type VendorScope } from "../../shared/vendorFulfillment";
import type { ForecastLine } from "../../shared/salesForecast";

export type ExtractCabinet = {
  uid?: string;
  cabinetId?: number;
  masterCode?: string | null;
  description?: string | null;
  category?: string | null;
  subCategory?: string | null;
  placement?: string | null;
  width?: number | null;
  depth?: number | null;
  height?: number | null;
  x?: number | null;
  y?: number | null;
  rotation?: number | null;
  styleId?: number | null;
  fillerForCabinetUid?: string | null;
  sinkTopProductId?: number | null;
  faucetProductId?: number | null;
};

export type ExtractSurface = {
  id: number;
  name: string;
  category: string;
  size?: string | null;
  coverageSqFt?: number | null;
  countertopScope?: "perimeter" | "island" | "all" | null;
};

export type ExtractDesign = {
  id: number;
  selectedStyleId?: number | null;
  selectedDistributorId?: number | null;
  placedCabinets?: ExtractCabinet[] | null;
  selectedSurfaces?: ExtractSurface[] | null;
  roomData?: {
    width?: number;
    depth?: number;
    ceilingHeight?: number;
    persistedEntities?: {
      sinks?: Array<{ pelicanProductId?: number | null; pelicanFaucetProductId?: number | null }>;
      potFillers?: Array<{ pelicanProductId?: number | null }>;
      island?: { x: number; y: number; width: number; depth: number; countertopOverhang?: number } | null;
    };
  } | null;
  trimSettings?: {
    crown?: boolean;
    toeKick?: boolean;
    batten?: boolean;
    lightRail?: boolean;
    valance?: boolean;
  } | null;
};

export type StyleFact = {
  id: number;
  name: string;
  doorStyle: string | null;
  color: string | null;
  distributorId: number;
};

export type DistributorFact = { id: number; name: string; seriesName: string | null };

export type PelicanFact = {
  id: number;
  name: string;
  category: string;
  size: string | null;
  listPrice: number | null;
  vendorWholesale: number | null;
  categoryMarkupBps: number | null;
};

export type SkuFact = {
  cabinetId: number;
  styleId: number;
  distributorId: number;
  sku: string;
  description: string;
  listPrice: number | null;
  vendorWholesale: number | null;
  vendorMarkupPercent: number | null;
};

const UNSPECIFIED = "unspecified";

function textOrUnspecified(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : UNSPECIFIED;
}

function asPlaced(cabinets: ExtractCabinet[]): PlacedCabinet[] {
  return cabinets.map((cabinet, index) => ({
    uid: cabinet.uid || `c${index}`,
    cabinetId: cabinet.cabinetId ?? 0,
    masterCode: cabinet.masterCode ?? "",
    description: cabinet.description ?? "",
    category: cabinet.category ?? "",
    subCategory: cabinet.subCategory ?? "",
    placement: cabinet.placement ?? "base",
    width: Number(cabinet.width) || 0,
    depth: Number(cabinet.depth) || 24,
    height: Number(cabinet.height) || 34.5,
    x: Number(cabinet.x) || 0,
    y: Number(cabinet.y) || 0,
    rotation: Number(cabinet.rotation) || 0,
    styleId: cabinet.styleId ?? null,
    fillerForCabinetUid: cabinet.fillerForCabinetUid ?? null,
  })) as PlacedCabinet[];
}

function roomOf(design: ExtractDesign): RoomData {
  const room = design.roomData;
  if (room && Number(room.width) > 0 && Number(room.depth) > 0) {
    return { width: Number(room.width), depth: Number(room.depth), ceilingHeight: Number(room.ceilingHeight) || DEFAULT_ROOM.ceilingHeight };
  }
  return DEFAULT_ROOM;
}

export function extractDesignLines(
  design: ExtractDesign,
  catalog: {
    styles: ReadonlyMap<number, StyleFact>;
    distributors: ReadonlyMap<number, DistributorFact>;
    skus: ReadonlyMap<string, SkuFact>;
    pelican: ReadonlyMap<number, PelicanFact>;
  },
): ForecastLine[] {
  const lines: ForecastLine[] = [];
  const placedRaw = design.placedCabinets ?? [];
  const placed = asPlaced(placedRaw);
  const room = roomOf(design);
  const selectedStyle = design.selectedStyleId != null ? catalog.styles.get(design.selectedStyleId) : undefined;
  const designDistributor = design.selectedDistributorId != null ? catalog.distributors.get(design.selectedDistributorId) : undefined;
  const cabinetScope: VendorScope | null = design.selectedDistributorId != null ? distributorScope(design.selectedDistributorId) : null;

  const pushCabinet = (cabinet: ExtractCabinet, owner: PlacedCabinet | null) => {
    const styleId = owner?.styleId ?? cabinet.styleId ?? design.selectedStyleId ?? null;
    const style = styleId != null ? catalog.styles.get(styleId) : undefined;
    const distributorId = style?.distributorId ?? design.selectedDistributorId ?? null;
    const distributor = distributorId != null ? catalog.distributors.get(distributorId) : undefined;
    const scope = distributorId != null ? distributorScope(distributorId) : null;
    const skuFact = cabinet.cabinetId != null && styleId != null
      ? catalog.skus.get(`${cabinet.cabinetId}:${styleId}:${distributorId ?? ""}`)
        ?? catalog.skus.get(`${cabinet.cabinetId}:${styleId}`)
      : undefined;
    lines.push({
      designId: design.id,
      scope,
      sku: skuFact?.sku || cabinet.masterCode || "unspecified",
      description: skuFact?.description || cabinet.description || cabinet.masterCode || "Cabinet",
      supplierName: distributor?.name ?? null,
      category: textOrUnspecified(cabinet.category ?? "cabinet"),
      color: textOrUnspecified(style?.color),
      styleName: textOrUnspecified(style?.doorStyle ?? style?.name ?? selectedStyle?.doorStyle),
      seriesName: textOrUnspecified(distributor?.seriesName),
      quantity: 1,
      estimated: false,
      listPrice: skuFact?.listPrice ?? null,
      vendorWholesale: skuFact?.vendorWholesale ?? null,
      vendorMarkupPercent: skuFact?.vendorMarkupPercent ?? null,
    });
  };

  placedRaw.forEach((cabinet, index) => {
    const placedCabinet = placed[index]!;
    if (isFillerItem(placedCabinet)) {
      const owner = adjacentCabinetForFiller(placedCabinet, placed, room);
      pushCabinet(cabinet, owner);
      return;
    }
    pushCabinet(cabinet, null);
  });

  const trim = design.trimSettings;
  const estimateToeKick = trim == null || trim.toeKick !== false;
  if (estimateToeKick && cabinetScope) {
    const inches = toeKickLinearInches(placed);
    const order = trimPiecesNeeded(inches);
    if (order.pieces > 0) {
      lines.push(trimLine(design.id, cabinetScope, designDistributor, "TK-8", "Toe kick", order.pieces, trim == null, `${order.measuredFeet} ft estimated`));
    }
  }
  if (trim?.crown && cabinetScope) {
    const segments = crownSegments(placed);
    const takeoff = crownTakeoffFromExposedSegments(segments);
    const order = trimPiecesNeeded(takeoff.totalLinearInches);
    if (order.pieces > 0) {
      lines.push(trimLine(
        design.id,
        cabinetScope,
        designDistributor,
        "CROWN",
        "Crown molding",
        order.pieces,
        false,
        `${round1(takeoff.totalLinearInches)} in including ${takeoff.miterAllowanceInches} in miter allowance`,
      ));
    }
  }

  const area = countertopArea(placed, design.roomData?.persistedEntities?.island ?? null);
  for (const surface of design.selectedSurfaces ?? []) {
    const product = catalog.pelican.get(surface.id);
    const category = (surface.category || product?.category || "").toLowerCase();
    const isCounter = category.includes("countertop") || category.includes("quartz");
    let quantity = 1;
    let note = "";
    let estimated = false;
    if (isCounter) {
      const slabSqFt = countertopSlabSquareFeet(surface.size ?? product?.size);
      if (area.squareFeet > 0 && slabSqFt) {
        quantity = Math.ceil(area.squareFeet / slabSqFt);
        note = `${round1(area.squareFeet)} sq ft ÷ ${round1(slabSqFt)} sq ft/slab = ${quantity} slabs (estimated)`;
        estimated = true;
      } else if (area.squareFeet > 0) {
        quantity = 0;
        note = `${round1(area.squareFeet)} sq ft, ${round1(area.linearFeet)} linear ft. Slab count needs a catalog size.`;
        estimated = true;
      }
    }
    if (quantity <= 0 && !note) continue;
    lines.push({
      designId: design.id,
      scope: PELICAN_SCOPE,
      sku: product ? `PEL-${product.id}` : `PEL-${surface.id}`,
      description: product?.name || surface.name,
      supplierName: "Pelican",
      category: textOrUnspecified(surface.category || product?.category),
      color: textOrUnspecified(surface.name),
      styleName: textOrUnspecified(surface.category),
      seriesName: UNSPECIFIED,
      quantity: quantity > 0 ? quantity : area.squareFeet,
      estimated,
      note: note || undefined,
      listPrice: product?.listPrice ?? null,
      vendorWholesale: product?.vendorWholesale ?? null,
      categoryMarkupBps: product?.categoryMarkupBps ?? null,
    });
  }

  const fixtureIds = new Set<number>();
  for (const cabinet of placedRaw) {
    if (cabinet.sinkTopProductId) fixtureIds.add(cabinet.sinkTopProductId);
    if (cabinet.faucetProductId) fixtureIds.add(cabinet.faucetProductId);
  }
  for (const sink of design.roomData?.persistedEntities?.sinks ?? []) {
    if (sink.pelicanProductId) fixtureIds.add(sink.pelicanProductId);
    if (sink.pelicanFaucetProductId) fixtureIds.add(sink.pelicanFaucetProductId);
  }
  for (const filler of design.roomData?.persistedEntities?.potFillers ?? []) {
    if (filler.pelicanProductId) fixtureIds.add(filler.pelicanProductId);
  }
  for (const id of Array.from(fixtureIds)) {
    if ((design.selectedSurfaces ?? []).some((surface) => surface.id === id)) continue;
    const product = catalog.pelican.get(id);
    lines.push({
      designId: design.id,
      scope: PELICAN_SCOPE,
      sku: `PEL-${id}`,
      description: product?.name || `Fixture ${id}`,
      supplierName: "Pelican",
      category: textOrUnspecified(product?.category ?? "fixture"),
      color: UNSPECIFIED,
      styleName: UNSPECIFIED,
      seriesName: UNSPECIFIED,
      quantity: 1,
      estimated: false,
      listPrice: product?.listPrice ?? null,
      vendorWholesale: product?.vendorWholesale ?? null,
      categoryMarkupBps: product?.categoryMarkupBps ?? null,
    });
  }

  return lines.filter((line) => line.quantity > 0);
}

function crownSegments(placed: PlacedCabinet[]): CrownTakeoffSegment[] {
  return placed
    .filter((cabinet) => cabinet.placement === "wall" || cabinet.placement === "tall")
    .map((cabinet) => {
      const width = Number(cabinet.width) || 0;
      const x = Number(cabinet.x) || 0;
      const z = Number(cabinet.y) || 0;
      return { start: { x, z }, end: { x: x + width, z }, length: width };
    })
    .filter((segment) => (segment.length ?? 0) > 0);
}

function trimLine(
  designId: number,
  scope: VendorScope,
  distributor: DistributorFact | undefined,
  sku: string,
  description: string,
  quantity: number,
  estimated: boolean,
  note: string,
): ForecastLine {
  return {
    designId,
    scope,
    sku,
    description,
    supplierName: distributor?.name ?? null,
    category: "trim",
    color: UNSPECIFIED,
    styleName: UNSPECIFIED,
    seriesName: textOrUnspecified(distributor?.seriesName),
    quantity,
    estimated,
    note,
    listPrice: null,
    vendorWholesale: null,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
