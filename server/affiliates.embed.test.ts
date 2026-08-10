import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { affiliates } from "../drizzle/schema";

// Mirrors the context shape used by server/affiliates.savePersist.test.ts.
function partnerCtx() {
  return {
    user: { id: 1, role: "admin", email: "7809tom@gmail.com", name: "Tom" },
    req: {} as never,
    res: {} as never,
  } as never;
}

async function readRow(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(affiliates).where(eq(affiliates.id, id)).limit(1);
  return rows[0] ?? null;
}

const GOOD = '<script src="https://static.elfsight.com/platform/platform.js" async></script>';
const BAD = '<script>document.cookie="stolen=1"</script>';

describe("affiliate embed code draft / publish flow", () => {
  it("saving a draft does NOT change what the storefront serves", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(partnerCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    const before = await readRow(mine.id);
    if (!before) return;

    try {
      await caller.affiliates.updateMyStorefront({ embedCodeDraft: GOOD });
      const row = await readRow(mine.id);
      expect(row!.embedCodeDraft).toBe(GOOD);
      // Draft saved, but nothing published yet.
      const pub = await caller.affiliates.bySlug({ slug: before.slug });
      expect(pub!.embedCode).toBeNull();
    } finally {
      await db
        .update(affiliates)
        .set({
          embedCodeDraft: before.embedCodeDraft,
          embedCode: before.embedCode,
          embedEnabled: before.embedEnabled,
        })
        .where(eq(affiliates.id, mine.id));
    }
  });

  it("publishing copies the draft into the live snippet and exposes it publicly", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(partnerCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    const before = await readRow(mine.id);
    if (!before) return;

    try {
      await caller.affiliates.updateMyStorefront({ embedCodeDraft: GOOD });
      await caller.affiliates.publishEmbedCode({ affiliateId: mine.id });

      const row = await readRow(mine.id);
      expect(row!.embedCode).toBe(GOOD);
      expect(row!.embedEnabled).toBe(true);

      const pub = await caller.affiliates.bySlug({ slug: before.slug });
      expect(pub!.embedCode).toBe(GOOD);
      expect(pub!.embedEnabled).toBe(true);
    } finally {
      await db
        .update(affiliates)
        .set({
          embedCodeDraft: before.embedCodeDraft,
          embedCode: before.embedCode,
          embedEnabled: before.embedEnabled,
        })
        .where(eq(affiliates.id, mine.id));
    }
  });

  it("unpublishing hides the snippet publicly but keeps the draft", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(partnerCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    const before = await readRow(mine.id);
    if (!before) return;

    try {
      await caller.affiliates.updateMyStorefront({ embedCodeDraft: GOOD });
      await caller.affiliates.publishEmbedCode({ affiliateId: mine.id });
      await caller.affiliates.unpublishEmbedCode({ affiliateId: mine.id });

      const row = await readRow(mine.id);
      expect(row!.embedEnabled).toBe(false);
      // Draft is preserved so they can re-publish later.
      expect(row!.embedCodeDraft).toBe(GOOD);

      const pub = await caller.affiliates.bySlug({ slug: before.slug });
      expect(pub!.embedCode).toBeNull();
    } finally {
      await db
        .update(affiliates)
        .set({
          embedCodeDraft: before.embedCodeDraft,
          embedCode: before.embedCode,
          embedEnabled: before.embedEnabled,
        })
        .where(eq(affiliates.id, mine.id));
    }
  });

  it("refuses to publish a snippet that fails validation", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(partnerCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    const before = await readRow(mine.id);
    if (!before) return;

    try {
      await caller.affiliates.updateMyStorefront({ embedCodeDraft: BAD });
      await expect(
        caller.affiliates.publishEmbedCode({ affiliateId: mine.id })
      ).rejects.toThrow();
      // Nothing went live.
      const row = await readRow(mine.id);
      expect(row!.embedEnabled).toBe(false);
    } finally {
      await db
        .update(affiliates)
        .set({
          embedCodeDraft: before.embedCodeDraft,
          embedCode: before.embedCode,
          embedEnabled: before.embedEnabled,
        })
        .where(eq(affiliates.id, mine.id));
    }
  });

  it("refuses to publish when there is no draft at all", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(partnerCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    const before = await readRow(mine.id);
    if (!before) return;

    try {
      await db
        .update(affiliates)
        .set({ embedCodeDraft: null, embedEnabled: false })
        .where(eq(affiliates.id, mine.id));
      await expect(
        caller.affiliates.publishEmbedCode({ affiliateId: mine.id })
      ).rejects.toThrow();
    } finally {
      await db
        .update(affiliates)
        .set({
          embedCodeDraft: before.embedCodeDraft,
          embedCode: before.embedCode,
          embedEnabled: before.embedEnabled,
        })
        .where(eq(affiliates.id, mine.id));
    }
  });

  it("rejects an oversized draft at the schema boundary", async () => {
    const caller = appRouter.createCaller(partnerCtx());
    const mine = await caller.affiliates.myAffiliate();
    if (!mine) return;
    await expect(
      caller.affiliates.updateMyStorefront({ embedCodeDraft: "a".repeat(20000) })
    ).rejects.toThrow();
  });
});
