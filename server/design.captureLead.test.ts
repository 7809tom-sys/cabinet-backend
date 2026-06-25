import { describe, expect, it, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { designLeads, crmDeals } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// design.captureLead records a contact when a visitor launches the designer.
// Email is required; name + phone are optional; repeat launches for the same
// email de-dupe into one row and bump launchCount. listLeads is admin-only.
// These tests hit the live DB and clean up the rows they create.

function guestCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 999401,
      openId: "test-admin-leads",
      name: "Leads Admin",
      email: "admin-leads-test@example.com",
      role: "admin",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

function userCtx(): TrpcContext {
  return {
    user: {
      id: 999402,
      openId: "test-user-leads",
      name: "Regular User",
      email: "user-leads-test@example.com",
      role: "user",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

const TEST_EMAIL = "lead-capture-test@example.com";

async function cleanup() {
  const db = await getDb();
  if (!db) return;
  // Remove any auto-created house deals first, then the lead rows.
  await db.delete(crmDeals).where(eq(crmDeals.contactEmail, TEST_EMAIL));
  await db.delete(designLeads).where(eq(designLeads.email, TEST_EMAIL));
}

describe("design.captureLead — launch lead capture", () => {
  afterAll(cleanup);

  it("validates the email (rejects a bad address)", async () => {
    const caller = appRouter.createCaller(guestCtx());
    await expect(caller.design.captureLead({ email: "not-an-email" })).rejects.toThrow();
  });

  it("persists email + name + phone on first launch (email lowercased)", async () => {
    const db = await getDb();
    if (!db) return; // skip when DB not configured
    await cleanup();

    const caller = appRouter.createCaller(guestCtx());
    const res = await caller.design.captureLead({
      email: TEST_EMAIL.toUpperCase(),
      name: "  Jordan Tester  ",
      phone: " 941-555-0100 ",
      roomType: "kitchen",
    });
    expect(res.ok).toBe(true);

    const rows = await db
      .select()
      .from(designLeads)
      .where(eq(designLeads.email, TEST_EMAIL));
    expect(rows.length).toBe(1);
    expect(rows[0]?.email).toBe(TEST_EMAIL); // normalized to lowercase
    expect(rows[0]?.name).toBe("Jordan Tester"); // trimmed
    expect(rows[0]?.phone).toBe("941-555-0100"); // trimmed
    expect(rows[0]?.roomType).toBe("kitchen");
    expect(rows[0]?.launchCount).toBe(1);
  });

  it("auto-creates exactly one HOUSE crm deal and links it to the lead", async () => {
    const db = await getDb();
    if (!db) return;

    // The lead created above should carry a dealId pointing at a house deal.
    const leadRows = await db
      .select()
      .from(designLeads)
      .where(eq(designLeads.email, TEST_EMAIL));
    expect(leadRows.length).toBe(1);
    expect(leadRows[0]?.dealId).toBeTruthy();

    const deals = await db
      .select()
      .from(crmDeals)
      .where(eq(crmDeals.contactEmail, TEST_EMAIL));
    expect(deals.length).toBe(1); // exactly one deal
    expect(deals[0]?.affiliateId).toBeNull(); // house pipeline
    expect(deals[0]?.stage).toBe("new");
    expect(deals[0]?.id).toBe(leadRows[0]?.dealId);
  });

  it("de-dupes a repeat launch into one row and bumps launchCount", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(guestCtx());

    // Second launch by the same email, this time without a name.
    const res = await caller.design.captureLead({ email: TEST_EMAIL });
    expect(res.ok).toBe(true);
    // @ts-expect-error deduped flag only present on the ok branch
    expect(res.deduped).toBe(true);

    const rows = await db
      .select()
      .from(designLeads)
      .where(eq(designLeads.email, TEST_EMAIL));
    expect(rows.length).toBe(1); // still ONE row
    expect(rows[0]?.launchCount).toBe(2); // bumped
    // Earlier-captured name is preserved (not erased by the nameless relaunch).
    expect(rows[0]?.name).toBe("Jordan Tester");

    // A repeat launch must NOT spawn a second house deal.
    const deals = await db
      .select()
      .from(crmDeals)
      .where(eq(crmDeals.contactEmail, TEST_EMAIL));
    expect(deals.length).toBe(1);
  });

  it("listLeads is admin-only and includes captured leads", async () => {
    const db = await getDb();
    if (!db) return;

    // Non-admin is forbidden.
    const userCaller = appRouter.createCaller(userCtx());
    await expect(userCaller.design.listLeads()).rejects.toThrow();

    // Admin can read the list and our test lead is present.
    const adminCaller = appRouter.createCaller(adminCtx());
    const leads = await adminCaller.design.listLeads();
    expect(Array.isArray(leads)).toBe(true);
    expect(leads.some((l) => l.email === TEST_EMAIL)).toBe(true);
  });
});
