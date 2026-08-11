import { describe, expect, it } from "vitest";
import { resolveBoardScope, scopeWhere } from "./crm";

describe("CRM scope visibility", () => {
  it("leaves the master CRM unfiltered so it can oversee every affiliate", () => {
    expect(scopeWhere({ kind: "house" })).toBeUndefined();
  });

  it("keeps an affiliate CRM scoped to its own affiliate ownership", () => {
    expect(scopeWhere({ kind: "affiliate", affiliateId: 42 })).toBeDefined();
  });

  it("keeps master attribution available by leaving the default board in house scope", () => {
    expect(resolveBoardScope({ kind: "house" })).toEqual({ kind: "house" });
  });

  it("lets master users open a specific affiliate board without widening an affiliate user's scope", () => {
    expect(resolveBoardScope({ kind: "house" }, 42)).toEqual({ kind: "affiliate", affiliateId: 42 });
    expect(resolveBoardScope({ kind: "affiliate", affiliateId: 17 }, 42)).toEqual({ kind: "affiliate", affiliateId: 17 });
  });
});
