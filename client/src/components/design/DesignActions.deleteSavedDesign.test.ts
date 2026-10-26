import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actions = readFileSync(new URL("./DesignActions.tsx", import.meta.url), "utf8");
const router = readFileSync(new URL("../../../../server/routers/design.ts", import.meta.url), "utf8");

describe("saved-design permanent deletion contract", () => {
  it("requires an explicit destructive confirmation and starts a blank design only after server success", () => {
    expect(actions).toContain("trpc.design.remove.useMutation");
    expect(actions).toContain("Delete this saved design?");
    expect(actions).toContain("will be permanently deleted");
    expect(actions).toContain("Delete and start new design");
    expect(actions).toContain("onDeleteSuccess?.(result.id, result.name)");
    expect(actions).toContain("Choose a room layout to continue.");
    expect(actions.indexOf("onDeleteSuccess?.(result.id, result.name)")).toBeGreaterThan(actions.indexOf("onSuccess: (result)"));
  });

  it("hard-deletes only the authenticated creator's design in the selected store", () => {
    expect(router).toContain("remove: protectedProcedure");
    expect(router).toContain("eq(kitchenDesigns.userId, ctx.user.id)");
    expect(router).toContain("designAffiliateScopeCondition(affiliateId)");
    expect(router).toContain("await db.transaction(async (tx) =>");
    expect(router).toContain("await tx.delete(kitchenDesigns).where(ownership)");
  });

  it("removes reproducible plan state while preserving and detaching immutable order and appointment records", () => {
    expect(router).toContain("tx.update(orderRequests).set({ kitchenDesignId: null })");
    expect(router).toContain("tx.update(designConsultations).set({ designId: null })");
    expect(router).toContain("tx.delete(crmDealDesigns)");
    expect(router).toContain("tx.delete(threeDRoomShares)");
    expect(router).toContain("tx.delete(designImageRequests)");
    expect(router).toContain("tx.delete(designGeminiImageTestJobs)");
    expect(router).toContain("tx.delete(designPhotoRenders)");
  });
});
