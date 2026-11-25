import { describe, expect, it } from "vitest";
import { FabShopUndoMismatchError, summarizeFabShopImports, undoFabShopImport, type FabShopUndoStore } from "./fabShops";

const SEED = "Countertop Fabrication Shops in Florida (Nov 24 2026 sweep)";
const WRONG = "Quartz Fabricators in Florida";

function memoryStore(shops: { id: number; sourceDoc: string | null }[], links: { quoteId: number; fabShopId: number }[]) {
  const state = { shops: [...shops], links: [...links] };
  const store: FabShopUndoStore = {
    async shopIds(sourceDoc) { return state.shops.filter((s) => s.sourceDoc === sourceDoc).map((s) => s.id); },
    async deleteShops(ids) {
      const gone = new Set(ids);
      const before = { links: state.links.length, shops: state.shops.length };
      state.links = state.links.filter((l) => !gone.has(l.fabShopId));
      state.shops = state.shops.filter((s) => !gone.has(s.id));
      return { quoteMatches: before.links - state.links.length, shops: before.shops - state.shops.length };
    },
  };
  return { store, state };
}

const fixture = () => memoryStore(
  [
    { id: 1, sourceDoc: SEED }, { id: 2, sourceDoc: SEED },
    { id: 3, sourceDoc: WRONG }, { id: 4, sourceDoc: WRONG }, { id: 5, sourceDoc: WRONG },
    { id: 6, sourceDoc: null }, { id: 7, sourceDoc: `${WRONG} ` },
  ],
  [{ quoteId: 10, fabShopId: 1 }, { quoteId: 10, fabShopId: 3 }, { quoteId: 11, fabShopId: 4 }],
);

describe("undo a fabrication shop upload", () => {
  it("removes only the chosen upload and its quote matches", async () => {
    const { store, state } = fixture();
    const result = await undoFabShopImport(store, { sourceDoc: WRONG, confirmCount: 3 });
    expect(result).toEqual({ sourceDoc: WRONG, deletedShops: 3, deletedQuoteMatches: 2 });
    expect(state.shops.map((s) => s.id)).toEqual([1, 2, 6, 7]);
    expect(state.links).toEqual([{ quoteId: 10, fabShopId: 1 }]);
  });

  it("refuses when the confirmed count is stale, and deletes nothing", async () => {
    const { store, state } = fixture();
    await expect(undoFabShopImport(store, { sourceDoc: WRONG, confirmCount: 562 })).rejects.toBeInstanceOf(FabShopUndoMismatchError);
    expect(state.shops).toHaveLength(7);
    expect(state.links).toHaveLength(3);
  });

  it("refuses a blank source and never touches shops without one", async () => {
    const { store, state } = fixture();
    await expect(undoFabShopImport(store, { sourceDoc: "  ", confirmCount: 1 })).rejects.toThrow();
    expect(state.shops.some((s) => s.sourceDoc === null)).toBe(true);
  });
});

describe("past uploads list", () => {
  it("merges match counts, skips shops with no source, newest first", () => {
    const list = summarizeFabShopImports(
      [
        { sourceDoc: SEED, shops: "120", firstCreatedAt: "2026-11-24 15:00:00", lastCreatedAt: "2026-11-24 15:00:01" },
        { sourceDoc: WRONG, shops: 562, firstCreatedAt: new Date("2026-11-25T22:40:00Z"), lastCreatedAt: new Date("2026-11-25T22:40:05Z") },
        { sourceDoc: null, shops: 4, firstCreatedAt: null, lastCreatedAt: null },
      ],
      [{ sourceDoc: SEED, matches: 9, followedUp: "2" }, { sourceDoc: null, matches: 1, followedUp: 0 }],
    );
    expect(list.map((i) => i.sourceDoc)).toEqual([WRONG, SEED]);
    expect(list[0]).toMatchObject({ shops: 562, quoteMatches: 0, quoteMatchesFollowedUp: 0, lastCreatedAt: "2026-11-25T22:40:05.000Z" });
    expect(list[1]).toMatchObject({ shops: 120, quoteMatches: 9, quoteMatchesFollowedUp: 2 });
  });
});
