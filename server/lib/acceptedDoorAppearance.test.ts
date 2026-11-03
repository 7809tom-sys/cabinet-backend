import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptedRenderImageUrl,
  acceptedAppearanceFromStyleRow,
  deriveRenderImageHex,
  emptyAcceptedAppearance,
  mapWithConcurrency,
  missingAcceptedAppearanceColumns,
  normalizeRenderHex,
  resetAcceptedDoorAppearanceCache,
  resolveAcceptedAppearance,
  writeAcceptedAppearanceToStyle,
} from "./acceptedDoorAppearance";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const asDataUrl = (bytes = png) => `data:image/png;base64,${bytes.toString("base64")}`;

/** A door version shaped like an audit run: rendered PNG, no separate approved photo. */
const auditVersion = {
  id: 41,
  samplePhotoUrl: "/manus-storage/samples/sh.jpg",
  renderImageUrl: "/manus-storage/door-rendering-audit/style-330011/run-9.png",
  approvedDoorImageUrl: null,
  renderHex: "#c8a040",
};

/** The same version after a Designer or Featured Styles approval: a separate door photo. */
const approvedPhotoVersion = {
  ...auditVersion,
  id: 42,
  approvedDoorImageUrl: "/manus-storage/door-rendering-audit/style-330011/approved-door.png",
};

describe("the accepted render image is the source of truth", () => {
  beforeEach(() => {
    resetAcceptedDoorAppearanceCache();
  });

  it("prefers the approved door photo and falls back to the rendered PNG", () => {
    expect(acceptedRenderImageUrl(approvedPhotoVersion)).toBe(
      "/manus-storage/door-rendering-audit/style-330011/approved-door.png",
    );
    expect(acceptedRenderImageUrl(auditVersion)).toBe(
      "/manus-storage/door-rendering-audit/style-330011/run-9.png",
    );
    expect(acceptedRenderImageUrl(null)).toBeNull();
    expect(acceptedRenderImageUrl({ id: 7, renderImageUrl: "   " })).toBeNull();
  });

  it("reads the color out of the render image, not the catalog hex the render was drawn on", async () => {
    const loadImage = vi.fn(async () => asDataUrl());
    // Shaker Honey's catalog hex is #c8a040; the accepted render is light tan birch.
    const dominantHex = vi.fn(async () => "d9c9a3");
    const appearance = await resolveAcceptedAppearance(auditVersion, { loadImage, dominantHex });

    expect(appearance).toEqual({
      renderHex: "#d9c9a3",
      approvedReferenceImageUrl: auditVersion.renderImageUrl,
      colorSource: "render-image",
    });
    expect(appearance.renderHex).not.toBe("#c8a040");
    expect(loadImage).toHaveBeenCalledWith(auditVersion.renderImageUrl);
    expect(dominantHex).toHaveBeenCalledTimes(1);
  });

  it("reports the version's own hex only when the image cannot be read, and says so", async () => {
    const loadImage = vi.fn(async () => asDataUrl());
    const dominantHex = vi.fn(async () => null);
    const appearance = await resolveAcceptedAppearance(auditVersion, { loadImage, dominantHex });
    expect(appearance).toEqual({
      renderHex: "#c8a040",
      approvedReferenceImageUrl: auditVersion.renderImageUrl,
      colorSource: "version-render-hex",
    });
  });

  it("never invents a color when the image load throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const appearance = await resolveAcceptedAppearance(
      { ...auditVersion, renderHex: null },
      { loadImage: async () => { throw new Error("network down"); } },
    );
    expect(appearance).toEqual({
      renderHex: null,
      approvedReferenceImageUrl: auditVersion.renderImageUrl,
      colorSource: "none",
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("still returns the accepted image when there is no color at all", async () => {
    const appearance = await resolveAcceptedAppearance(
      { id: 9, renderImageUrl: "/stored/render.png", renderHex: null },
      { loadImage: async () => asDataUrl(), dominantHex: async () => null },
    );
    expect(appearance).toEqual({
      renderHex: null,
      approvedReferenceImageUrl: "/stored/render.png",
      colorSource: "none",
    });
  });

  it("reports nothing approved for a style with no accepted run", async () => {
    expect(await resolveAcceptedAppearance(null)).toEqual({
      renderHex: null,
      approvedReferenceImageUrl: null,
      colorSource: "none",
    });
    expect(await resolveAcceptedAppearance(undefined)).toEqual({
      renderHex: null,
      approvedReferenceImageUrl: null,
      colorSource: "none",
    });
  });
});

describe("render hex normalization and caching", () => {
  beforeEach(() => {
    resetAcceptedDoorAppearanceCache();
  });

  it("accepts only a 6-digit hex, with or without the hash", () => {
    expect(normalizeRenderHex("#D9C9A3")).toBe("#d9c9a3");
    expect(normalizeRenderHex(" d9c9a3 ")).toBe("#d9c9a3");
    expect(normalizeRenderHex("light tan")).toBeNull();
    expect(normalizeRenderHex("#fff")).toBeNull();
    expect(normalizeRenderHex(null)).toBeNull();
  });

  it("measures one image once, then reuses the reading", async () => {
    const loadImage = vi.fn(async () => asDataUrl());
    const dominantHex = vi.fn(async () => "d9c9a3");
    expect(await deriveRenderImageHex("/stored/a.png", { loadImage, dominantHex })).toBe("#d9c9a3");
    expect(await deriveRenderImageHex("/stored/a.png", { loadImage, dominantHex })).toBe("#d9c9a3");
    expect(loadImage).toHaveBeenCalledTimes(1);
    expect(dominantHex).toHaveBeenCalledTimes(1);
  });

  it("does not cache an unreadable image forever", async () => {
    const loadImage = vi.fn(async () => asDataUrl());
    const dominantHex = vi.fn(async () => null);
    const now = Date.now();
    await deriveRenderImageHex("/stored/b.png", { loadImage, dominantHex }, now);
    await deriveRenderImageHex("/stored/b.png", { loadImage, dominantHex }, now + 11 * 60 * 1000);
    expect(dominantHex).toHaveBeenCalledTimes(2);
  });
});

describe("the read side trusts the approval marker, not a typed-in hex", () => {
  it("returns the stored accepted appearance when a run is approved", () => {
    expect(acceptedAppearanceFromStyleRow(330011, {
      renderHex: "#d9c9a3",
      approvedReferenceImageUrl: "/manus-storage/approved.png",
      approvedVersionId: 41,
      approvedAt: new Date("2026-11-03T20:00:00Z"),
    })).toEqual({
      styleId: 330011,
      renderHex: "#d9c9a3",
      approvedReferenceImageUrl: "/manus-storage/approved.png",
      approvedVersionId: 41,
      approvedAt: new Date("2026-11-03T20:00:00Z"),
      colorSource: "render-image",
    });
  });

  it("ignores a renderHex typed into the style editor without an accepted run", () => {
    const style = acceptedAppearanceFromStyleRow(330011, {
      renderHex: "#d9c9a3",
      approvedReferenceImageUrl: "/manus-storage/approved.png",
      approvedVersionId: null,
      approvedAt: null,
    });
    expect(style).toEqual(emptyAcceptedAppearance(330011));
    expect(style.renderHex).toBeNull();
    expect(style.approvedReferenceImageUrl).toBeNull();
  });

  it("reports nothing approved for a missing style row", () => {
    expect(acceptedAppearanceFromStyleRow(77, undefined)).toEqual(emptyAcceptedAppearance(77));
  });
});

/** A stand-in for the drizzle handle, recording what the writeback actually sets. */
function fakeDb(options: { current?: { renderHex: string | null } } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [options.current ?? { renderHex: null }],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: async () => undefined };
      },
    }),
  };
  return { db, updates };
}

describe("recordDecision's writeback", () => {
  it("writes the accepted render's image and its measured color onto the style", async () => {
    const { db, updates } = fakeDb();
    const now = new Date("2026-11-03T20:30:00Z");
    const result = await writeAcceptedAppearanceToStyle(db as never, 330011, auditVersion, {
      loadImage: async () => asDataUrl(),
      dominantHex: async () => "d9c9a3",
      now,
    });
    expect(result.applied).toBe(true);
    expect(result.appearance.colorSource).toBe("render-image");
    expect(updates).toEqual([{
      renderHex: "#d9c9a3",
      approvedReferenceImageUrl: auditVersion.renderImageUrl,
      approvedVersionId: 41,
      approvedAt: now,
    }]);
  });

  it("clears the approval and the color it wrote when a revoke withdraws it", async () => {
    // The style's renderHex is exactly the color this feature read off the render.
    const { db, updates } = fakeDb({ current: { renderHex: "#d9c9a3" } });
    const result = await writeAcceptedAppearanceToStyle(db as never, 330011, null, {
      withdrawnVersion: auditVersion,
      loadImage: async () => asDataUrl(),
      dominantHex: async () => "d9c9a3",
    });
    expect(result.applied).toBe(true);
    expect(updates).toEqual([{
      approvedReferenceImageUrl: null,
      approvedVersionId: null,
      approvedAt: null,
      renderHex: null,
    }]);
  });

  it("leaves a hand-set color alone when the revoked render never matched it", async () => {
    const { db, updates } = fakeDb({ current: { renderHex: "#7a5c3a" } });
    await writeAcceptedAppearanceToStyle(db as never, 330011, null, {
      withdrawnVersion: auditVersion,
      loadImage: async () => asDataUrl(),
      dominantHex: async () => "d9c9a3",
    });
    expect(updates).toEqual([{
      approvedReferenceImageUrl: null,
      approvedVersionId: null,
      approvedAt: null,
    }]);
  });

  it("never fails an approval when the style row cannot be written", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      update: () => ({
        set: () => ({ where: async () => { throw new Error("Unknown column 'approvedAt'"); } }),
      }),
    };
    const result = await writeAcceptedAppearanceToStyle(db as never, 330011, auditVersion, {
      loadImage: async () => asDataUrl(),
      dominantHex: async () => "d9c9a3",
    });
    expect(result.applied).toBe(false);
    expect(result.appearance.renderHex).toBe("#d9c9a3");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("unmigrated databases degrade instead of failing", () => {
  it("recognizes an unknown column error for the 0245 columns", () => {
    const error = Object.assign(new Error("Failed query: select `approvedVersionId` from `door_styles`"), {
      cause: {
        code: "ER_BAD_FIELD_ERROR",
        errno: 1054,
        sqlMessage: "Unknown column 'door_styles.approvedVersionId' in 'field list'",
      },
    });
    expect(missingAcceptedAppearanceColumns(error)).toEqual(["approvedVersionId"]);
  });

  it("ignores an unrelated database error", () => {
    expect(missingAcceptedAppearanceColumns(new Error("connection reset"))).toEqual([]);
    expect(missingAcceptedAppearanceColumns(null)).toEqual([]);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps the input order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([5, 1, 4, 2, 3], 2, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return value * 2;
    });
    expect(out).toEqual([10, 2, 8, 4, 6]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async (value) => value)).toEqual([]);
  });
});
