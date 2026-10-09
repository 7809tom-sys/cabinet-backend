import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { kitchenDesigns } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// A logged-in member context so design.save persists with a userId and byId can
// read the row back.
function memberCtx(id: number, email: string): TrpcContext {
  return {
    user: { id, openId: `ss-${id}`, name: `SS ${id}`, email, role: "user" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

async function cleanup(ids: number[]) {
  const db = await getDb();
  if (!db) return;
  for (const id of ids) {
    await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, id));
  }
}

describe("design router — selectedSurfaces persistence", () => {
  it(
    "saves the Pelican surface picks and returns them intact from byId",
    { timeout: 30000 },
    async () => {
      const db = await getDb();
      if (!db) return; // empty DB env — skip

      const caller = appRouter.createCaller(memberCtx(999501, "ss-owner@example.com"));
      const created: number[] = [];

      // A representative surface pick per role, matching the SelectedSurface shape
      // the Surfaces tab stores (id, slug, name, category, subCategory, size,
      // imageUrl, sellPrice).
      const surfaces = [
        {
          id: 12001,
          slug: "acorn-20mil-dryback-planks",
          name: "Acorn 20mil Dryback Planks",
          category: "Flooring",
          subCategory: "Planks & Flooring",
          size: '7" x 48"',
          imageUrl: "https://example.com/acorn.jpg",
          sellPrice: 2.49,
        },
        {
          id: 12002,
          slug: "carrara-quartz-slab",
          name: "Carrara Quartz Slab",
          category: "Quartz Slabs (Countertops)",
          subCategory: "Quartz Slab",
          size: "126\" x 63\"",
          imageUrl: "https://example.com/carrara.jpg",
          sellPrice: 599,
        },
        {
          id: 12003,
          slug: "white-mosaic-tile",
          name: "White Mosaic Tile",
          category: "Tile & Mosaic",
          subCategory: "Mosaic",
          size: "12\" x 12\"",
          imageUrl: "https://example.com/mosaic.jpg",
          sellPrice: 9.99,
        },
      ];

      try {
        const saved = await caller.design.save({
          customer: { name: "Test Customer", email: "customer@example.test", phone: "555-010-0199", address: { line1: "100 Test Street", city: "Testville", state: "FL", zip: "34201" } },
name: `Surfaces round-trip ${Date.now()}`,
          roomData: { width: 144, depth: 120 },
          placedCabinets: [],
          selectedSurfaces: surfaces,
          roomType: "kitchen",
        } as Parameters<typeof caller.design.save>[0]);
        created.push(saved.id);

        const row = await caller.design.byId({ id: saved.id });
        expect(row).not.toBeNull();
        const restored = (row as { selectedSurfaces?: unknown }).selectedSurfaces;
        expect(Array.isArray(restored)).toBe(true);
        expect(restored).toEqual(surfaces);

        // Updating with a new (smaller) set fully replaces the stored surfaces.
        const trimmed = [surfaces[0]];
        await caller.design.save({
          customer: { name: "Test Customer", email: "customer@example.test", phone: "555-010-0199", address: { line1: "100 Test Street", city: "Testville", state: "FL", zip: "34201" } },
id: saved.id,
          name: "Surfaces round-trip (updated)",
          roomData: { width: 144, depth: 120 },
          placedCabinets: [],
          selectedSurfaces: trimmed,
          roomType: "kitchen",
        } as Parameters<typeof caller.design.save>[0]);

        const row2 = await caller.design.byId({ id: saved.id });
        const restored2 = (row2 as { selectedSurfaces?: unknown }).selectedSurfaces;
        expect(restored2).toEqual(trimmed);
      } finally {
        await cleanup(created);
      }
    },
  );

  it(
    "stores null when a design is saved with no surface picks",
    { timeout: 30000 },
    async () => {
      const db = await getDb();
      if (!db) return; // empty DB env — skip

      const caller = appRouter.createCaller(memberCtx(999502, "ss-empty@example.com"));
      const created: number[] = [];

      try {
        const saved = await caller.design.save({
          customer: { name: "Test Customer", email: "customer@example.test", phone: "555-010-0199", address: { line1: "100 Test Street", city: "Testville", state: "FL", zip: "34201" } },
name: `No surfaces ${Date.now()}`,
          roomData: { width: 120, depth: 120 },
          placedCabinets: [],
          roomType: "kitchen",
        } as Parameters<typeof caller.design.save>[0]);
        created.push(saved.id);

        const row = await caller.design.byId({ id: saved.id });
        const restored = (row as { selectedSurfaces?: unknown }).selectedSurfaces;
        expect(restored == null).toBe(true);
      } finally {
        await cleanup(created);
      }
    },
  );
});
