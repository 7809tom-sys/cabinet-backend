import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { kitchenDesigns } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// Two distinct members so we can prove project rollups are owner-scoped.
function memberCtx(id: number, email: string): TrpcContext {
  return {
    user: { id, openId: `ps-${id}`, name: `PS ${id}`, email, role: "user" },
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

describe("design router — projectSummary roll-up", () => {
  it(
    "rolls up rooms in a project, sums subtotals, and isolates by owner",
    { timeout: 30000 },
    async () => {
      const db = await getDb();
      if (!db) return; // empty DB env — skip

      const caller = appRouter.createCaller(memberCtx(999401, "ps-owner@example.com"));
      const other = appRouter.createCaller(memberCtx(999402, "ps-other@example.com"));
      const project = `PS Test Project ${Date.now()}`;
      const created: number[] = [];

      try {
        // Owner saves three rooms under the same project. placedCabinets is
        // empty so subtotals compute to 0 (pricing is exercised elsewhere) —
        // here we assert the GROUPING + roll-up structure, not SKU math.
        for (const label of ["Kitchen", "Master Bath", "Laundry"]) {
          const d = await caller.design.save({
            customer: { name: "Test Customer", email: "customer@example.test", phone: "555-010-0199", address: { line1: "100 Test Street", city: "Testville", state: "FL", zip: "34201" } },
name: `${label} layout`,
            roomData: { width: 144, depth: 120 },
            placedCabinets: [],
            projectName: project,
            roomLabel: label,
            roomType: label === "Kitchen" ? "kitchen" : label === "Laundry" ? "laundry" : "bathroom",
          });
          created.push(d.id);
        }

        // A different owner's design in a same-named project must NOT bleed in.
        const intruder = await other.design.save({
          customer: { name: "Test Customer", email: "customer@example.test", phone: "555-010-0199", address: { line1: "100 Test Street", city: "Testville", state: "FL", zip: "34201" } },
name: "Not mine",
          roomData: { width: 100, depth: 100 },
          placedCabinets: [],
          projectName: project,
          roomLabel: "Kitchen",
          roomType: "kitchen",
        });
        created.push(intruder.id);

        const summary = await caller.design.projectSummary({ projectName: project });
        expect(summary.projectName).toBe(project);
        expect(summary.roomCount).toBe(3); // owner's three rooms only
        expect(summary.rooms.map((r) => r.roomLabel).sort()).toEqual(
          ["Kitchen", "Laundry", "Master Bath"],
        );
        // grandTotal is the sum of room subtotals.
        const sum = summary.rooms.reduce((s, r) => s + r.subtotal, 0);
        expect(summary.grandTotal).toBeCloseTo(sum, 2);

        // myProjects lists the project for the owner with the right room count.
        const projects = await caller.design.myProjects();
        const mine = projects.find((p) => p.projectName === project);
        expect(mine?.roomCount).toBe(3);
      } finally {
        await cleanup(created);
      }
    },
  );

  it(
    "adds a flat $100 custom-size adjustment per resized cabinet in the subtotal",
    { timeout: 30000 },
    async () => {
      const db = await getDb();
      if (!db) return; // empty DB env — skip

      const caller = appRouter.createCaller(memberCtx(999403, "ps-fee@example.com"));
      const project = `PS Fee Project ${Date.now()}`;
      const created: number[] = [];

      try {
        // One stock cabinet + two resized cabinets (cabinetId 0 keeps SKU price
        // at 0 so we isolate the fee math). Expect 2 x $100 = $200 subtotal.
        const d = await caller.design.save({
          customer: { name: "Test Customer", email: "customer@example.test", phone: "555-010-0199", address: { line1: "100 Test Street", city: "Testville", state: "FL", zip: "34201" } },
name: "Fee room",
          roomData: { width: 144, depth: 120 },
          placedCabinets: [
            { uid: "a", cabinetId: 0, masterCode: "B-24", description: "Stock", placement: "base", x: 0, y: 0, width: 24, depth: 24, rotation: 0, nominalWidth: 24, nominalDepth: 24 },
            { uid: "b", cabinetId: 0, masterCode: "B-24", description: "Wide", placement: "base", x: 30, y: 0, width: 30, depth: 24, rotation: 0, nominalWidth: 24, nominalDepth: 24 },
            { uid: "c", cabinetId: 0, masterCode: "B-24", description: "Deep", placement: "base", x: 64, y: 0, width: 24, depth: 30, rotation: 0, nominalWidth: 24, nominalDepth: 24 },
          ],
          projectName: project,
          roomLabel: "Kitchen",
          roomType: "kitchen",
        } as Parameters<typeof caller.design.save>[0]);
        created.push(d.id);

        const summary = await caller.design.projectSummary({ projectName: project });
        const room = summary.rooms.find((r) => r.id === d.id);
        expect(room?.subtotal).toBeCloseTo(200, 2);
      } finally {
        await cleanup(created);
      }
    },
  );
});
