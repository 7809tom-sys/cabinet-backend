import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Public-procedure context (no user needed for pantry queries).
function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const HS = 30005; // Hickory Shaker (Silva Shaker)

describe("pantry split-pantry pairing", () => {
  it("lists split-pantry bottoms (UCB..54), widths 24/30/36, never 18", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const bottoms = await caller.pantry.listBottoms();
    const widths = bottoms.map((b) => b.width).sort((a, b) => a - b);
    expect(widths).toEqual([24, 30, 36]);
    // 18" must NOT be a split-pantry bottom (single-piece tall pantry only).
    expect(bottoms.some((b) => b.width === 18)).toBe(false);
    expect(bottoms.every((b) => /^UCB\d+54$/.test(b.masterCode))).toBe(true);
  });

  it("pairs a 24\" bottom at 84\" total with the W243024 top in the same style", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const bottoms = await caller.pantry.listBottoms();
    const b24 = bottoms.find((b) => b.width === 24)!;
    expect(b24).toBeTruthy();

    const top = await caller.pantry.pairForBottom({
      bottomCabinetId: b24.cabinetId,
      totalHeight: 84,
      styleId: HS,
    });
    expect(top).not.toBeNull();
    expect(top!.masterCode).toBe("W243024");
    expect(top!.width).toBe(24);
    expect(top!.topHeight).toBe(30);
    expect(top!.totalHeight).toBe(84);
    expect(top!.styleId).toBe(HS);
    // HS top price for W243024 is 769.31 per the catalog.
    expect(top!.unitPrice).toBeCloseTo(769.31, 2);
  });

  it("pairs a 36\" bottom at 96\" total with the W364224 top", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const bottoms = await caller.pantry.listBottoms();
    const b36 = bottoms.find((b) => b.width === 36)!;
    const top = await caller.pantry.pairForBottom({
      bottomCabinetId: b36.cabinetId,
      totalHeight: 96,
      styleId: HS,
    });
    expect(top).not.toBeNull();
    expect(top!.masterCode).toBe("W364224");
    expect(top!.totalHeight).toBe(96);
  });

  it("returns null when pairing a non-pantry cabinet id", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const top = await caller.pantry.pairForBottom({
      bottomCabinetId: 198, // U-24-96-24 single tall utility, not a split bottom
      totalHeight: 84,
      styleId: HS,
    });
    expect(top).toBeNull();
  });
});
