import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./routers/design.ts", import.meta.url), "utf8");

describe("design.autosave", () => {
  it("updates only an existing owned design without creating a new plan or CRM side effects", () => {
    const start = source.indexOf("autosave: protectedProcedure");
    const end = source.indexOf("rename: protectedProcedure", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const autosave = source.slice(start, end);

    expect(autosave).toContain("id: z.number().int().positive()");
    expect(autosave).toContain("eq(kitchenDesigns.userId, ctx.user.id)");
    expect(autosave).toContain("designAffiliateScopeCondition(affiliateId)");
    expect(autosave).toContain("await db.update(kitchenDesigns)");
    expect(autosave).not.toContain("db.insert(kitchenDesigns)");
    expect(autosave).not.toContain("linkDesignToCrmDeal");
    expect(autosave).not.toContain("emitCrmEvent");
  });
});
