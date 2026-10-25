import { and, asc, eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb, notInConflict } from "../db";
import { emailSettingsReady, sendEmail, sendEmailViaSettings } from "../email";
import { storagePut } from "../storage";
import {
  cabinets,
  distributors,
  distributorSkus,
  doorStyles,
  emailSettings,
  layoutPresetZones,
  layoutPresets,
  roomShapePresets,
  threeDRoomShares,
} from "../../drizzle/schema";

const catalogInput = z.object({
  layoutPresetId: z.string().min(1).max(64),
  distributorId: z.number().int().positive(),
  styleId: z.number().int().positive(),
});

const sharedConfigurationInput = z.object({
  layoutPresetId: z.string().min(1).max(64),
  distributorId: z.number().int().positive(),
  styleId: z.number().int().positive(),
  room: z.object({ width: z.number().positive(), depth: z.number().positive(), ceilingHeight: z.number().positive().optional() }).passthrough(),
  placed: z.array(z.unknown()).max(300),
  openings: z.array(z.unknown()).max(100).optional(),
  sinks: z.array(z.unknown()).max(50).optional(),
  presentation: z.object({ cabinetFinish: z.string().min(1).max(32), countertopFinish: z.string().regex(/^#[0-9a-f]{6}$/i) }),
  orderSummary: z.object({ itemCount: z.number().int().nonnegative(), pricedLineCount: z.number().int().nonnegative(), unpricedLineCount: z.number().int().nonnegative(), subtotal: z.number().nonnegative() }).optional(),
  thumbnailDataUrl: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/).max(600_000).optional(),
});

const sharedThumbnailInput = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{16,48}$/),
  thumbnailDataUrl: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/).max(600_000),
});

function shareThumbnailBytes(dataUrl: string): Buffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 450_000) throw new Error("The shared-view thumbnail is invalid or too large.");
  return bytes;
}

const emailQuoteInput = z.object({
  pdfBase64: z.string().min(100).max(8_000_000),
  itemCount: z.number().int().nonnegative(),
  subtotal: z.number().nonnegative(),
  cabinetFinish: z.string().min(1).max(48),
  countertopFinish: z.string().min(1).max(48),
});

function asNumber(value: unknown) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function buildRoomScene(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  input: z.infer<typeof catalogInput>,
) {
  const zones = await db
    .select()
    .from(layoutPresetZones)
    .where(eq(layoutPresetZones.layoutPresetId, input.layoutPresetId))
    .orderBy(asc(layoutPresetZones.sequence));
  const [layout] = await db
    .select()
    .from(layoutPresets)
    .where(and(eq(layoutPresets.id, input.layoutPresetId), eq(layoutPresets.isActive, true)))
    .limit(1);
  if (!layout || !zones.length) {
    return { layoutPresetId: input.layoutPresetId, roomShape: null, layout: null, zones: [], candidatesByZone: {}, suggestions: [], materials: null };
  }

  const [roomShape] = await db
    .select()
    .from(roomShapePresets)
    .where(and(eq(roomShapePresets.id, layout.roomShapePresetId), eq(roomShapePresets.isActive, true)))
    .limit(1);
  const [style] = await db
    .select({
      id: doorStyles.id,
      publicName: doorStyles.aliasName,
      name: doorStyles.ourName,
      finish: doorStyles.finish,
      color: doorStyles.color,
      doorStyle: doorStyles.doorStyle,
      doorPanelType: doorStyles.doorPanelType,
      doorSampleImageUrl: doorStyles.doorSampleImageUrl,
      drawerSampleImageUrl: doorStyles.drawerSampleImageUrl,
      cornerSwatchImageUrl: doorStyles.cornerSwatchImageUrl,
    })
    .from(doorStyles)
    .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, input.distributorId), eq(doorStyles.isActive, true)))
    .limit(1);
  if (!roomShape || !style) {
    return { layoutPresetId: input.layoutPresetId, roomShape: roomShape ?? null, layout, zones, candidatesByZone: {}, suggestions: [], materials: null };
  }

  const categories = Array.from(new Set(zones.map((zone) => zone.requiredCategory).filter((value): value is string => Boolean(value))));
  const itemRows = await db
    .select({
      distributorSkuId: distributorSkus.id,
      distributorSku: distributorSkus.distributorSku,
      platformSku: distributorSkus.platformSku,
      homeownerPrice: distributorSkus.homeownerPrice,
      imageUrl: distributorSkus.imageUrl,
      cabinetId: cabinets.id,
      masterCode: cabinets.masterCode,
      description: cabinets.description,
      category: cabinets.category,
      subCategory: cabinets.subCategory,
      productType: cabinets.productType,
      cornerType: cabinets.cornerType,
      placementType: cabinets.placementType,
      width: cabinets.width,
      height: cabinets.height,
      depth: cabinets.depth,
      catalogImageUrl: cabinets.catalogImageUrl,
      numberOfDoors: cabinets.numberOfDoors,
      numberOfDrawers: cabinets.numberOfDrawers,
    })
    .from(distributorSkus)
    .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
    .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
    .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
    .where(and(
      eq(distributorSkus.distributorId, input.distributorId),
      eq(distributorSkus.styleId, input.styleId),
      eq(distributorSkus.isPublished, true),
      eq(distributorSkus.isAvailable, true),
      eq(distributorSkus.status, "approved"),
      eq(distributors.isActive, true),
      eq(doorStyles.isActive, true),
      eq(cabinets.isActive, true),
      eq(cabinets.showInDesigner, true),
      notInConflict(),
      inArray(cabinets.category, categories),
    ));

  const candidatesByZone = Object.fromEntries(zones.map((zone) => {
    const candidates = itemRows
      .filter((item) => {
        const width = asNumber(item.width);
        if (zone.requiredSubCategory && item.subCategory !== zone.requiredSubCategory) return false;
        if (zone.requiredProductType && item.productType !== zone.requiredProductType) return false;
        if (zone.requiredCornerType && item.cornerType !== zone.requiredCornerType) return false;
        if (zone.minWidth != null && width != null && width < Number(zone.minWidth)) return false;
        if (zone.maxWidth != null && width != null && width > Number(zone.maxWidth)) return false;
        return true;
      })
      .sort((left, right) => {
        const target = Number(zone.targetWidth ?? 0);
        const leftDistance = Math.abs((asNumber(left.width) ?? target) - target);
        const rightDistance = Math.abs((asNumber(right.width) ?? target) - target);
        return leftDistance - rightDistance || left.masterCode.localeCompare(right.masterCode);
      })
      .slice(0, 4);
    return [zone.zoneKey, candidates];
  }));
  const suggestions = zones.map((zone) => ({
    zone: {
      zoneKey: zone.zoneKey,
      label: zone.label,
      wallKey: zone.wallKey,
      sequence: zone.sequence,
      placementType: zone.placementType,
      required: zone.isRequired,
    },
    sku: (candidatesByZone[zone.zoneKey] as typeof itemRows | undefined)?.[0] ?? null,
  }));

  return {
    layoutPresetId: input.layoutPresetId,
    roomShape,
    layout,
    zones,
    candidatesByZone,
    suggestions,
    materials: {
      cabinet: style,
      defaults: { floor: "#b89778", countertop: "#e9e7e2", backsplash: "#d9d5cc", wall: "#efece6" },
    },
  };
}

/**
 * Returns only products that are real, orderable distributor SKUs for the
 * selected style/supply line. Layout-zone rules are then applied in memory so
 * nullable zone requirements remain straightforward and explainable.
 */
export const roomLayoutsRouter = router({
  presets: publicProcedure
    .input(z.object({ roomType: z.string().max(32).optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { roomShapes: [], layouts: [], zones: [] };

      const roomConditions = [eq(roomShapePresets.isActive, true)];
      if (input?.roomType) roomConditions.push(eq(roomShapePresets.roomType, input.roomType));

      const roomShapes = await db
        .select()
        .from(roomShapePresets)
        .where(and(...roomConditions))
        .orderBy(asc(roomShapePresets.sortOrder), asc(roomShapePresets.name));

      const activeShapeIds = roomShapes.map((shape) => shape.id);
      if (!activeShapeIds.length) return { roomShapes, layouts: [], zones: [] };

      const layouts = await db
        .select()
        .from(layoutPresets)
        .where(and(eq(layoutPresets.isActive, true), inArray(layoutPresets.roomShapePresetId, activeShapeIds)))
        .orderBy(asc(layoutPresets.sortOrder), asc(layoutPresets.name));

      const activeLayoutIds = layouts.map((layout) => layout.id);
      const zones = activeLayoutIds.length
        ? await db
          .select()
          .from(layoutPresetZones)
          .where(inArray(layoutPresetZones.layoutPresetId, activeLayoutIds))
          .orderBy(asc(layoutPresetZones.layoutPresetId), asc(layoutPresetZones.sequence))
        : [];

      return { roomShapes, layouts, zones };
    }),

  eligibleCatalog: publicProcedure
    .input(catalogInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { layoutPresetId: input.layoutPresetId, zones: [], candidatesByZone: {} };
      const scene = await buildRoomScene(db, input);
      return { layoutPresetId: scene.layoutPresetId, zones: scene.zones, candidatesByZone: scene.candidatesByZone };
    }),

  scene: publicProcedure
    .input(catalogInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { layoutPresetId: input.layoutPresetId, roomShape: null, layout: null, zones: [], candidatesByZone: {}, suggestions: [], materials: null };
      return buildRoomScene(db, input);
    }),

  createShare: publicProcedure
    .input(sharedConfigurationInput)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const token = randomBytes(18).toString("base64url");
      const { thumbnailDataUrl, ...configuration } = input;
      const thumbnail = thumbnailDataUrl
        ? await storagePut(`three-d-share-previews/${token}.jpg`, shareThumbnailBytes(thumbnailDataUrl), "image/jpeg")
        : null;
      await db.insert(threeDRoomShares).values({
        token,
        configuration,
        orderSubtotal: configuration.orderSummary?.subtotal?.toFixed(2) ?? null,
        thumbnailKey: thumbnail?.key ?? null,
      });
      return { token };
    }),

  updateShareThumbnail: publicProcedure
    .input(sharedThumbnailInput)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [share] = await db
        .select({ id: threeDRoomShares.id })
        .from(threeDRoomShares)
        .where(eq(threeDRoomShares.token, input.token))
        .limit(1);
      if (!share) throw new Error("The shared 3D view could not be found.");
      const thumbnail = await storagePut(
        `three-d-share-previews/${input.token}.jpg`,
        shareThumbnailBytes(input.thumbnailDataUrl),
        "image/jpeg",
      );
      await db.update(threeDRoomShares)
        .set({ thumbnailKey: thumbnail.key })
        .where(eq(threeDRoomShares.id, share.id));
      return { updated: true };
    }),

  sharedConfiguration: publicProcedure
    .input(z.object({ token: z.string().min(16).max(48) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [share] = await db
        .select({ configuration: threeDRoomShares.configuration, orderSubtotal: threeDRoomShares.orderSubtotal, createdAt: threeDRoomShares.createdAt })
        .from(threeDRoomShares)
        .where(eq(threeDRoomShares.token, input.token))
        .limit(1);
      return share ?? null;
    }),

  emailQuote: protectedProcedure
    .input(emailQuoteInput)
    .mutation(async ({ ctx, input }) => {
      const recipient = ctx.user.email?.trim();
      if (!recipient) throw new Error("Your account does not have an email address. Add one before emailing a quote.");
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [settings] = await db.select().from(emailSettings).limit(1);
      const subject = `Your Cabinet Dealz quote — $${input.subtotal.toFixed(2)}`;
      const text = [
        "Your Cabinet Dealz 3D room quote is attached.",
        `Items: ${input.itemCount}`,
        `Catalog-priced subtotal: $${input.subtotal.toFixed(2)}`,
        `3D presentation: ${input.cabinetFinish} cabinets · ${input.countertopFinish} countertop`,
        "Preview finishes are visual only; final pricing is based on the orderable catalog selections in your design.",
      ].join("\n");
      const attachment = {
        filename: "cabinet-dealz-3d-quote.pdf",
        content: Buffer.from(input.pdfBase64, "base64"),
        contentType: "application/pdf",
      };
      const result = emailSettingsReady(settings)
        ? await sendEmailViaSettings(settings, { to: recipient, subject, text, attachments: [attachment] })
        : await sendEmail({ to: recipient, subject, text, attachments: [attachment] });
      if (!result.success) {
        throw new Error(result.notConfigured ? "Quote email is not configured yet. Please contact Cabinet Dealz support." : result.error ?? "Quote email could not be sent.");
      }
      return { sentTo: recipient };
    }),
});
