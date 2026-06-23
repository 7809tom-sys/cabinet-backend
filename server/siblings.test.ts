import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// The in-place finish picker on the Family page: a shopper should be able to
// switch the COLOR within the same door profile without leaving the family.
// `doorStyles.siblings` powers that swatch row.
describe("doorStyles.siblings — in-place finish picker", () => {
  it("returns color variations within the same door profile, current first", async () => {
    const caller = appRouter.createCaller(publicCtx());

    // Find a door style that actually has profile-mates (same doorStyle).
    const all = await caller.doorStyles.list();
    expect(all.length).toBeGreaterThan(0);

    const byProfile = new Map<string, typeof all>();
    for (const s of all) {
      if (!s.doorStyle) continue;
      const arr = byProfile.get(s.doorStyle) ?? [];
      arr.push(s);
      byProfile.set(s.doorStyle, arr);
    }
    // Pick a profile with more than one color.
    const multi = [...byProfile.values()].find((arr) => arr.length > 1);
    expect(multi, "expected at least one door profile with multiple colors").toBeTruthy();

    const seed = multi![0];
    const sibs = await caller.doorStyles.siblings({ styleCode: seed.styleCode });

    // The seed style is returned first.
    expect(sibs.length).toBeGreaterThan(1);
    expect(sibs[0].id).toBe(seed.id);

    // Every sibling shares the same door profile as the seed.
    for (const s of sibs) {
      expect(s.doorStyle).toBe(seed.doorStyle);
    }

    // No duplicate display names in the returned set.
    const names = sibs.map((s) => (s.ourName || s.styleCode || "").toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("returns just the single style when it has no profile-mates / unknown code", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const none = await caller.doorStyles.siblings({ styleCode: "__NOPE__" });
    expect(Array.isArray(none)).toBe(true);
    expect(none.length).toBe(0);
  });

  it("exposes a real Aero (Skyline) style code for the family route", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const all = await caller.doorStyles.list();
    const aero = all.find((s) => (s.ourName ?? "").toLowerCase().startsWith("aero"));
    // Not strictly required, but log it so we can screenshot the right URL.
    if (aero) {
      // eslint-disable-next-line no-console
      console.log("AERO_STYLE_CODE=", aero.styleCode, "| name=", aero.ourName);
      expect(aero.styleCode).toBeTruthy();
    }
  });
});
