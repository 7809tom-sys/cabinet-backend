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
});
