import { and, eq, gt, inArray } from "drizzle-orm";
import {
  crmDealDesigns,
  crmDeals,
  distributorSkus,
  distributors,
  doorStyles,
  kitchenDesigns,
  orderRequests,
  pelicanCategoryMarkups,
  salesForecastCloseBrackets,
  users,
} from "../../drizzle/schema";
import { pelicanProducts } from "../../drizzle/pelicanSchema";
import { getDb } from "../db";
import { PLACEHOLDER_CLOSE_BRACKETS, type CloseRateBracket } from "../../shared/closeRateBrackets";
import { aggregateForecast, type ForecastDesignMeta, type ForecastFilters, type ForecastLine } from "../../shared/salesForecast";
import { extractDesignLines, type ExtractDesign, type PelicanFact, type SkuFact, type StyleFact } from "./extract";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function loadCloseBrackets(db: Database): Promise<CloseRateBracket[]> {
  const rows = await db.select().from(salesForecastCloseBrackets);
  if (rows.length === 0) return [...PLACEHOLDER_CLOSE_BRACKETS];
  return rows
    .map((row) => ({ minDays: row.minDays, maxDays: row.maxDays, closePercent: row.closePercent, sortOrder: row.sortOrder }))
    .sort((a, b) => a.minDays - b.minDays);
}

export async function runSalesForecast(input: {
  filters?: ForecastFilters;
  page?: number;
  pageSize?: number;
  homeownerMarkupBps: number;
}) {
  const db = await getDb();
  if (!db) {
    return aggregateForecast({
      designs: [],
      lines: [],
      brackets: PLACEHOLDER_CLOSE_BRACKETS,
      filters: input.filters,
      homeownerMarkupBps: input.homeownerMarkupBps,
      page: input.page,
      pageSize: input.pageSize,
    });
  }
  const brackets = await loadCloseBrackets(db);
  const styleRows = await db.select({
    id: doorStyles.id,
    name: doorStyles.ourName,
    doorStyle: doorStyles.doorStyle,
    color: doorStyles.color,
    distributorId: doorStyles.distributorId,
  }).from(doorStyles);
  const styles = new Map<number, StyleFact>(styleRows.map((row) => [row.id, row]));
  const distributorRows = await db.select({
    id: distributors.id,
    name: distributors.name,
    seriesName: distributors.seriesName,
    markupPercent: distributors.markupPercent,
  }).from(distributors);
  const distributorsById = new Map(distributorRows.map((row) => [row.id, row]));
  const markupRows = await db.select({ category: pelicanCategoryMarkups.category, markupBps: pelicanCategoryMarkups.markupBps }).from(pelicanCategoryMarkups);
  const markupByCategory = new Map(markupRows.map((row) => [row.category, row.markupBps]));

  const designs: ForecastDesignMeta[] = [];
  const lines: ForecastLine[] = [];
  let cursor = 0;
  for (;;) {
    const batch = await db.select({
      id: kitchenDesigns.id,
      name: kitchenDesigns.name,
      userId: kitchenDesigns.userId,
      selectedStyleId: kitchenDesigns.selectedStyleId,
      selectedDistributorId: kitchenDesigns.selectedDistributorId,
      placedCabinets: kitchenDesigns.placedCabinets,
      selectedSurfaces: kitchenDesigns.selectedSurfaces,
      roomData: kitchenDesigns.roomData,
      trimSettings: kitchenDesigns.trimSettings,
      updatedAt: kitchenDesigns.updatedAt,
    }).from(kitchenDesigns).where(gt(kitchenDesigns.id, cursor)).orderBy(kitchenDesigns.id).limit(200);
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;
    const ids = batch.map((row) => row.id);
    const userIds = Array.from(new Set(batch.map((row) => row.userId).filter((id): id is number => id != null)));
    const [orderRows, linkRows, userRows] = await Promise.all([
      db.select({
        designId: orderRequests.kitchenDesignId,
        status: orderRequests.status,
        paidAt: orderRequests.paidAt,
      }).from(orderRequests).where(inArray(orderRequests.kitchenDesignId, ids)),
      db.select({
        designId: crmDealDesigns.designId,
        stage: crmDeals.stage,
        contactName: crmDeals.contactName,
      }).from(crmDealDesigns).innerJoin(crmDeals, eq(crmDeals.id, crmDealDesigns.dealId)).where(inArray(crmDealDesigns.designId, ids)),
      userIds.length
        ? db.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, userIds))
        : Promise.resolve([]),
    ]);
    const roleByUser = new Map(userRows.map((row) => [row.id, row.role]));
    const ordersByDesign = new Map<number, typeof orderRows>();
    for (const order of orderRows) {
      if (order.designId == null) continue;
      const list = ordersByDesign.get(order.designId) ?? [];
      list.push(order);
      ordersByDesign.set(order.designId, list);
    }
    const dealByDesign = new Map<number, { stage: string; contactName: string | null }>();
    for (const link of linkRows) dealByDesign.set(link.designId, { stage: link.stage, contactName: link.contactName });

    const cabinetIds = new Set<number>();
    const pelicanIds = new Set<number>();
    for (const row of batch) {
      const placed = Array.isArray(row.placedCabinets) ? row.placedCabinets as Array<{ cabinetId?: number; sinkTopProductId?: number; faucetProductId?: number }> : [];
      for (const cabinet of placed) {
        if (cabinet.cabinetId) cabinetIds.add(cabinet.cabinetId);
        if (cabinet.sinkTopProductId) pelicanIds.add(cabinet.sinkTopProductId);
        if (cabinet.faucetProductId) pelicanIds.add(cabinet.faucetProductId);
      }
      const surfaces = Array.isArray(row.selectedSurfaces) ? row.selectedSurfaces as Array<{ id?: number }> : [];
      for (const surface of surfaces) if (surface.id) pelicanIds.add(surface.id);
      const persisted = (row.roomData as { persistedEntities?: { sinks?: Array<{ pelicanProductId?: number; pelicanFaucetProductId?: number }>; potFillers?: Array<{ pelicanProductId?: number }> } } | null)?.persistedEntities;
      for (const sink of persisted?.sinks ?? []) {
        if (sink.pelicanProductId) pelicanIds.add(sink.pelicanProductId);
        if (sink.pelicanFaucetProductId) pelicanIds.add(sink.pelicanFaucetProductId);
      }
      for (const filler of persisted?.potFillers ?? []) if (filler.pelicanProductId) pelicanIds.add(filler.pelicanProductId);
    }

    const skus = new Map<string, SkuFact>();
    for (const idChunk of chunk(Array.from(cabinetIds), 400)) {
      if (idChunk.length === 0) continue;
      const skuRows = await db.select({
        cabinetId: distributorSkus.cabinetId,
        styleId: distributorSkus.styleId,
        distributorId: distributorSkus.distributorId,
        sku: distributorSkus.distributorSku,
        description: distributorSkus.supplierDescription,
        listPrice: distributorSkus.listPrice,
        vendorWholesale: distributorSkus.vendorWholesale,
      }).from(distributorSkus).where(and(inArray(distributorSkus.cabinetId, idChunk), eq(distributorSkus.isAvailable, true)));
      for (const sku of skuRows) {
        if (sku.cabinetId == null) continue;
        const fact: SkuFact = {
          cabinetId: sku.cabinetId,
          styleId: sku.styleId,
          distributorId: sku.distributorId,
          sku: sku.sku,
          description: sku.description ?? sku.sku,
          listPrice: num(sku.listPrice),
          vendorWholesale: num(sku.vendorWholesale),
          vendorMarkupPercent: num(distributorsById.get(sku.distributorId)?.markupPercent),
        };
        skus.set(`${sku.cabinetId}:${sku.styleId}:${sku.distributorId}`, fact);
        if (!skus.has(`${sku.cabinetId}:${sku.styleId}`)) skus.set(`${sku.cabinetId}:${sku.styleId}`, fact);
      }
    }
    const pelican = new Map<number, PelicanFact>();
    for (const idChunk of chunk(Array.from(pelicanIds), 400)) {
      if (idChunk.length === 0) continue;
      const products = await db.select({
        id: pelicanProducts.id,
        name: pelicanProducts.name,
        category: pelicanProducts.category,
        size: pelicanProducts.size,
        listPrice: pelicanProducts.listPrice,
        vendorWholesale: pelicanProducts.vendorWholesale,
      }).from(pelicanProducts).where(inArray(pelicanProducts.id, idChunk));
      for (const product of products) {
        pelican.set(product.id, {
          id: product.id,
          name: product.name,
          category: product.category,
          size: product.size,
          listPrice: num(product.listPrice),
          vendorWholesale: num(product.vendorWholesale),
          categoryMarkupBps: markupByCategory.get(product.category) ?? null,
        });
      }
    }

    for (const row of batch) {
      const ordersForDesign = ordersByDesign.get(row.id) ?? [];
      const ordered = ordersForDesign.some((order) => order.status === "submitted" || order.status === "confirmed" || order.paidAt != null);
      const deal = dealByDesign.get(row.id);
      const stage = deal?.stage ?? null;
      const status: ForecastDesignMeta["status"] = ordered
        ? "ordered"
        : stage === "lost"
          ? "lost"
          : stage === "won" || stage === "new_sale"
            ? "won"
            : stage === "quoted"
              ? "quoted"
              : ordersForDesign.some((order) => order.status === "draft")
                ? "draft"
                : ordersForDesign.some((order) => order.status === "cancelled")
                  ? "cancelled"
                  : "saved";
      const style = row.selectedStyleId != null ? styles.get(row.selectedStyleId) : undefined;
      const distributor = row.selectedDistributorId != null ? distributorsById.get(row.selectedDistributorId) : undefined;
      designs.push({
        id: row.id,
        name: row.name,
        updatedAt: row.updatedAt,
        customerName: deal?.contactName ?? null,
        styleName: style?.doorStyle || style?.name || "",
        color: style?.color || "",
        seriesName: distributor?.seriesName || distributor?.name || "",
        customerType: row.userId != null ? roleByUser.get(row.userId) || "" : "",
        status,
        ordered,
        crmStage: stage,
      });
      try {
        lines.push(...extractDesignLines(row as ExtractDesign, {
          styles,
          distributors: new Map(Array.from(distributorsById.entries()).map(([id, value]) => [id, { id, name: value.name, seriesName: value.seriesName }])),
          skus,
          pelican,
        }));
      } catch {
        lines.push({
          designId: row.id,
          scope: null,
          sku: "unspecified",
          description: "Layout could not be measured",
          supplierName: null,
          category: "unspecified",
          color: "unspecified",
          styleName: "unspecified",
          seriesName: "unspecified",
          quantity: 0,
          estimated: true,
          listPrice: null,
          vendorWholesale: null,
        });
      }
    }
  }

  return aggregateForecast({
    designs,
    lines: lines.filter((line) => line.quantity > 0),
    brackets,
    filters: input.filters,
    homeownerMarkupBps: input.homeownerMarkupBps,
    page: input.page,
    pageSize: input.pageSize,
  });
}

export async function replaceCloseBrackets(db: Database, brackets: CloseRateBracket[]) {
  await db.delete(salesForecastCloseBrackets).where(gt(salesForecastCloseBrackets.id, 0));
  if (brackets.length === 0) return;
  await db.insert(salesForecastCloseBrackets).values(brackets.map((bracket, index) => ({
    minDays: bracket.minDays,
    maxDays: bracket.maxDays,
    closePercent: Math.round(bracket.closePercent),
    sortOrder: bracket.sortOrder ?? index,
  })));
}
