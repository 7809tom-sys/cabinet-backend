/**
 * Countertop quote intake.
 *
 * Every order that contains a countertop line lands in the Countertop Quotes
 * queue with both plans attached: the countertop plan (the quoteable surface
 * lines) and the designer plan (the saved 3D layout snapshot the top is priced
 * against). The standalone quote form keeps its own path; this module is the
 * order path, and it is idempotent on the order request id so a retry or a
 * backfill run never creates a second quote for the same order.
 */
import { eq } from "drizzle-orm";
import {
  countertopQuotes,
  kitchenDesigns,
  type OrderLineItem,
} from "../../drizzle/schema";
import type { getDb } from "../db";
import { isPelicanSlabLine } from "./pelicanSlabQuoteEmail";
import { attachFabShopsToNewQuote } from "./fabShops";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type KitchenDesignRow = typeof kitchenDesigns.$inferSelect;

export type CountertopPlanLine = {
  sku: string | null;
  description: string | null;
  category: string | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
};

export type CountertopPlanPayload = {
  planId: string;
  orderRequestNumber: string;
  materialSku: string | null;
  materialName: string | null;
  /** Lines the customer ordered; the countertop is priced from these. */
  lines: CountertopPlanLine[];
  /** The order does not measure the top, so footage is settled at quote time. */
  totalSqFt: number | null;
  linearFt: number | null;
  /** Slabs on the order: countertop qty is one slab each (shippingRules). */
  slabCount: number;
  /** One truck carries this many slabs; larger jobs split across loads. */
  truckloadCapacity: number;
  truckloads: number;
  cutouts: Array<{ type: string; notes?: string }>;
  notes: string | null;
};

export type DesignerPlanPayload = {
  designId: string;
  designName: string | null;
  layoutType: string | null;
  roomDimensionsIn: Record<string, unknown> | null;
  sceneSnapshot: {
    roomData: Record<string, unknown> | null;
    placedCabinets: unknown[];
    selectedSurfaces: unknown[];
    styleId: number | null;
  };
  updatedAt: string | null;
};

type CountertopLineInput = Pick<OrderLineItem, "productKind" | "category" | "description" | "qty">;

/** True when this order line is a countertop (supplier slab / countertop lane). */
export function isCountertopOrderLine(line: CountertopLineInput | null | undefined): boolean {
  if (!line) return false;
  return isPelicanSlabLine({
    productKind: line.productKind ?? null,
    category: line.category ?? null,
    description: line.description ?? null,
    qty: line.qty ?? 1,
  });
}

export function countertopOrderLines(lines: readonly OrderLineItem[]): OrderLineItem[] {
  return lines.filter((line) => isCountertopOrderLine(line));
}

export function countertopPlanForOrder(input: {
  orderRequestId: number;
  requestNumber: string;
  lines: readonly OrderLineItem[];
  notes?: string | null;
}): CountertopPlanPayload | null {
  const lines = countertopOrderLines(input.lines);
  if (lines.length === 0) return null;
  const mapped: CountertopPlanLine[] = lines.map((line) => ({
    sku: (line.masterCode ?? line.rawCode ?? null) || null,
    description: line.description ?? null,
    category: line.category ?? null,
    quantity: Number(line.qty) || 1,
    unitPrice: line.unitPrice == null ? null : Number(line.unitPrice),
    lineTotal: line.linePrice == null ? null : Number(line.linePrice),
  }));
  // Countertop qty is one slab per unit (the designer already sends slabs), so
  // the truckload count is the ordered slab count over the 40-slab limit.
  const slabCount = mapped.reduce((sum, line) => sum + Math.max(0, Math.round(line.quantity)), 0);
  const truckloadCapacity = 40;
  return {
    planId: `order:${input.orderRequestId}`,
    orderRequestNumber: input.requestNumber,
    materialSku: mapped[0]?.sku ?? null,
    materialName: mapped[0]?.description ?? null,
    lines: mapped,
    totalSqFt: null,
    linearFt: null,
    slabCount,
    truckloadCapacity,
    truckloads: Math.max(1, Math.ceil(slabCount / truckloadCapacity)),
    cutouts: [],
    notes: input.notes ?? null,
  };
}

/**
 * The saved 3D designer plan as a self-contained snapshot. The quote keeps its
 * own copy: the saved design can be edited later, and the quote has to price
 * the layout that was ordered, not whatever the designer shows next week.
 */
export function designerPlanForDesign(design: KitchenDesignRow | null | undefined): DesignerPlanPayload | null {
  if (!design) return null;
  return {
    designId: String(design.id),
    designName: design.name ?? null,
    layoutType: design.roomType ?? null,
    roomDimensionsIn: (design.roomData as Record<string, unknown> | null) ?? null,
    sceneSnapshot: {
      roomData: (design.roomData as Record<string, unknown> | null) ?? null,
      placedCabinets: Array.isArray(design.placedCabinets) ? design.placedCabinets : [],
      selectedSurfaces: Array.isArray(design.selectedSurfaces) ? design.selectedSurfaces : [],
      styleId: design.selectedStyleId ?? null,
    },
    updatedAt: design.updatedAt instanceof Date ? design.updatedAt.toISOString() : null,
  };
}

export type EnsureCountertopQuoteResult = { quoteId: number; created: boolean };

/**
 * Creates the countertop quote for one order, or refreshes the plans on the one
 * that already exists. Returns null when the order has no countertop line or no
 * contact email to put on the quote.
 */
export async function ensureCountertopQuoteForOrder(
  db: Db,
  input: {
    orderRequestId: number;
    requestNumber: string;
    userId: number | null;
    affiliateId: number | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    zip: string | null;
    lines: readonly OrderLineItem[];
    notes?: string | null;
    kitchenDesignId?: number | null;
  },
): Promise<EnsureCountertopQuoteResult | null> {
  const countertopPlan = countertopPlanForOrder(input);
  if (!countertopPlan) return null;

  const design = input.kitchenDesignId == null
    ? null
    : (await db
      .select()
      .from(kitchenDesigns)
      .where(eq(kitchenDesigns.id, input.kitchenDesignId))
      .limit(1))[0] ?? null;
  const designerPlan = designerPlanForDesign(design);

  const [existing] = await db
    .select({ id: countertopQuotes.id })
    .from(countertopQuotes)
    .where(eq(countertopQuotes.orderRequestId, input.orderRequestId))
    .limit(1);

  if (existing) {
    await db
      .update(countertopQuotes)
      .set({
        kitchenDesignId: design?.id ?? null,
        countertopPlan,
        designerPlan,
        roomData: (design?.roomData as object | null) ?? null,
        placedCabinets: Array.isArray(design?.placedCabinets) ? design.placedCabinets as object[] : null,
        material: countertopPlan.materialName?.slice(0, 128) ?? null,
        updatedAt: new Date(),
      })
      .where(eq(countertopQuotes.id, existing.id));
    await attachFabShopsToNewQuote(db, { id: existing.id, zip: input.zip });
    return { quoteId: existing.id, created: false };
  }

  // An order can carry no email. The quote is created anyway: the owner records
  // the fabricator's email when a deal with the shop is negotiated, and a
  // missing address must never keep a countertop order out of the queue.
  const contactEmail = (input.contactEmail ?? "").trim() || null;

  const result = await db.insert(countertopQuotes).values({
    userId: input.userId,
    affiliateId: input.affiliateId,
    contactName: input.contactName,
    contactEmail,
    contactPhone: input.contactPhone,
    zip: input.zip,
    material: countertopPlan.materialName?.slice(0, 128) ?? null,
    // Footage is settled when the top is measured; the order only carries the
    // ordered surface lines, not the fabrication takeoff.
    squareFeet: "0.00",
    linearFeet: "0.00",
    hasIsland: false,
    roomData: (design?.roomData as object | null) ?? null,
    placedCabinets: Array.isArray(design?.placedCabinets) ? design.placedCabinets as object[] : null,
    notes: input.notes ?? null,
    orderRequestId: input.orderRequestId,
    kitchenDesignId: design?.id ?? null,
    sourceType: "order",
    countertopPlan,
    designerPlan,
    status: "new",
  });
  const insertId = (result as unknown as [{ insertId: number }])[0].insertId;
  // Route it: save the nearest approved fabrication shops on the quote so the
  // admin queue opens with candidates ready. This sends nothing by itself; the
  // package is dispatched from the quote card once the shop is chosen.
  await attachFabShopsToNewQuote(db, { id: insertId, zip: input.zip });
  return { quoteId: insertId, created: true };
}
