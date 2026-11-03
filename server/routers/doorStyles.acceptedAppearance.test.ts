import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("../lib/doorRenderingAuditScore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/doorRenderingAuditScore")>();
  return { ...actual, imageUrlToDataUrl: vi.fn(async () => "data:image/png;base64,iVBORw0KGgo=") };
});
vi.mock("../lib/colorSampler", () => ({
  extractDominantColor: vi.fn(async () => "d9c9a3"),
}));

import { doorStylesRouter } from "./catalog";
import { resetAcceptedDoorAppearanceCache } from "../lib/acceptedDoorAppearance";
import { imageUrlToDataUrl } from "../lib/doorRenderingAuditScore";
import { extractDominantColor } from "../lib/colorSampler";

/**
 * A database stub for the two reads `acceptedAppearance` performs.
 *
 * `styleRows` are the migrated `door_styles` rows; `events` and `versions` are the
 * audit tables used when a style has no approval marker (or the columns are missing).
 */
function stubDb(input: {
  styleRows?: Array<Record<string, unknown>>;
  styleReadError?: Error;
  events?: Array<{ id: number; styleId: number; versionId: number; action: string }>;
  versions?: Array<Record<string, unknown>>;
}) {
  const queriedTables: string[] = [];
  const db = {
    select: () => ({
      from: (table: unknown) => {
        const name = getTableName(table as Parameters<typeof getTableName>[0]);
        queriedTables.push(name);
        const rows = () => {
          if (name === "door_styles") return input.styleRows ?? [];
          if (name === "door_rendering_version_events") return input.events ?? [];
          if (name === "door_rendering_versions") return input.versions ?? [];
          return [];
        };
        return {
          where: () => {
            if (name === "door_styles" && input.styleReadError) return Promise.reject(input.styleReadError);
            return Promise.resolve(rows());
          },
          limit: () => Promise.resolve(rows()),
        };
      },
    }),
  };
  return { db, queriedTables };
}

const caller = () => doorStylesRouter.createCaller({ user: null, req: { headers: {} }, res: {} } as never);

beforeEach(() => {
  getDbMock.mockReset();
  vi.mocked(imageUrlToDataUrl).mockClear();
  vi.mocked(extractDominantColor).mockClear();
  vi.mocked(extractDominantColor).mockResolvedValue("d9c9a3");
  resetAcceptedDoorAppearanceCache();
});

describe("doorStyles.acceptedAppearance", () => {
  it("returns the accepted render image and the color read from it", async () => {
    getDbMock.mockResolvedValue(stubDb({
      styleRows: [{
        id: 330011,
        renderHex: "#d9c9a3",
        approvedReferenceImageUrl: "/manus-storage/door-rendering-audit/style-330011/run-9.png",
        approvedVersionId: 41,
        approvedAt: new Date("2026-11-03T20:00:00Z"),
      }],
    }).db);

    const result = await caller().acceptedAppearance({ styleId: 330011 });
    expect(result).toEqual({
      styleId: 330011,
      renderHex: "#d9c9a3",
      approvedReferenceImageUrl: "/manus-storage/door-rendering-audit/style-330011/run-9.png",
      approvedVersionId: 41,
      approvedAt: new Date("2026-11-03T20:00:00Z"),
      colorSource: "render-image",
    });
    // The stored color is the accepted render's color, not the catalog #c8a040.
    expect(result.renderHex).not.toBe("#c8a040");
  });

  it("answers a batch in the order it was asked, one entry per style", async () => {
    getDbMock.mockResolvedValue(stubDb({
      styleRows: [
        {
          id: 330011,
          renderHex: "#d9c9a3",
          approvedReferenceImageUrl: "/manus-storage/a.png",
          approvedVersionId: 41,
          approvedAt: null,
        },
        {
          id: 540005,
          renderHex: "#4a4a4a",
          approvedReferenceImageUrl: "/manus-storage/c.png",
          approvedVersionId: 7,
          approvedAt: null,
        },
      ],
    }).db);

    const list = await caller().acceptedAppearance({ styleIds: [540005, 999999, 330011] });
    expect(list.map((row) => row.styleId)).toEqual([540005, 999999, 330011]);
    expect(list[0]).toMatchObject({ approvedVersionId: 7, renderHex: "#4a4a4a" });
    expect(list[1]).toMatchObject({ approvedVersionId: null, renderHex: null, colorSource: "none" });
    expect(list[2]).toMatchObject({ approvedVersionId: 41, renderHex: "#d9c9a3" });
  });

  it("returns 200-shaped 'nothing approved' when no database is configured", async () => {
    getDbMock.mockResolvedValue(null);
    expect(await caller().acceptedAppearance({ styleId: 330011 })).toEqual({
      styleId: 330011,
      renderHex: null,
      approvedReferenceImageUrl: null,
      approvedVersionId: null,
      approvedAt: null,
      colorSource: "none",
    });
  });

  it("rejects a call that names no style instead of guessing", async () => {
    getDbMock.mockResolvedValue(null);
    await expect(caller().acceptedAppearance({} as never)).rejects.toThrow();
    await expect(caller().acceptedAppearance({ styleId: 0 } as never)).rejects.toThrow();
  });

  it("reports an accepted run that predates the style writeback, measuring its render", async () => {
    // The style row carries no approval marker: a run was accepted before this
    // deploy, so only the audit history knows about it.
    getDbMock.mockResolvedValue(stubDb({
      styleRows: [{ id: 330011, renderHex: "#c8a040", approvedReferenceImageUrl: null, approvedVersionId: null, approvedAt: null }],
      events: [
        { id: 1, styleId: 330011, versionId: 40, action: "accepted" },
        { id: 2, styleId: 330011, versionId: 41, action: "accepted" },
      ],
      versions: [{
        id: 41,
        renderImageUrl: "/manus-storage/door-rendering-audit/style-330011/run-9.png",
        approvedDoorImageUrl: null,
        renderHex: "#c8a040",
      }],
    }).db);

    const result = await caller().acceptedAppearance({ styleId: 330011 });
    expect(result).toMatchObject({
      styleId: 330011,
      approvedVersionId: 41,
      renderHex: "#d9c9a3",
      approvedReferenceImageUrl: "/manus-storage/door-rendering-audit/style-330011/run-9.png",
      colorSource: "render-image",
    });
    expect(imageUrlToDataUrl).toHaveBeenCalledWith("/manus-storage/door-rendering-audit/style-330011/run-9.png");
  });

  it("ignores a revoked run's history so a withdrawn approval stops driving the kitchen", async () => {
    getDbMock.mockResolvedValue(stubDb({
      styleRows: [{ id: 330011, renderHex: null, approvedReferenceImageUrl: null, approvedVersionId: null, approvedAt: null }],
      events: [
        { id: 1, styleId: 330011, versionId: 41, action: "accepted" },
        { id: 2, styleId: 330011, versionId: 41, action: "revoked" },
      ],
      versions: [{ id: 41, renderImageUrl: "/stored/run-9.png", approvedDoorImageUrl: null, renderHex: "#c8a040" }],
    }).db);

    const result = await caller().acceptedAppearance({ styleId: 330011 });
    expect(result.approvedVersionId).toBeNull();
    expect(result.renderHex).toBeNull();
    expect(result.colorSource).toBe("none");
    expect(extractDominantColor).not.toHaveBeenCalled();
  });

  it("falls back to the recorded color, and labels it, when the render image cannot be read", async () => {
    vi.mocked(extractDominantColor).mockResolvedValue(null);
    getDbMock.mockResolvedValue(stubDb({
      styleRows: [{ id: 330011, renderHex: null, approvedReferenceImageUrl: null, approvedVersionId: null, approvedAt: null }],
      events: [{ id: 1, styleId: 330011, versionId: 41, action: "accepted" }],
      versions: [{ id: 41, renderImageUrl: "/stored/run-9.png", approvedDoorImageUrl: null, renderHex: "#d9c9a3" }],
    }).db);

    const result = await caller().acceptedAppearance({ styleId: 330011 });
    expect(result).toMatchObject({ renderHex: "#d9c9a3", colorSource: "version-render-hex", approvedVersionId: 41 });
  });

  it("degrades to the audit history when the 0245 columns are not on the database yet", async () => {
    const unknownColumn = Object.assign(
      new Error("Failed query: select `approvedVersionId` from `door_styles`"),
      { cause: { code: "ER_BAD_FIELD_ERROR", errno: 1054, sqlMessage: "Unknown column 'door_styles.approvedVersionId' in 'field list'" } },
    );
    getDbMock.mockResolvedValue(stubDb({
      styleReadError: unknownColumn,
      events: [{ id: 1, styleId: 330011, versionId: 41, action: "accepted" }],
      versions: [{
        id: 41,
        renderImageUrl: "/stored/run-9.png",
        approvedDoorImageUrl: "/stored/approved-door.png",
        renderHex: "#c8a040",
      }],
    }).db);

    const result = await caller().acceptedAppearance({ styleId: 330011 });
    expect(result).toMatchObject({
      approvedVersionId: 41,
      renderHex: "#d9c9a3",
      approvedReferenceImageUrl: "/stored/approved-door.png",
      colorSource: "render-image",
    });
  });

  it("never throws when every read fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    getDbMock.mockResolvedValue(stubDb({ styleReadError: new Error("connection reset") }).db);
    const result = await caller().acceptedAppearance({ styleId: 330011 });
    expect(result).toMatchObject({ approvedVersionId: null, renderHex: null, colorSource: "none" });
    spy.mockRestore();
  });

  it("is public: a shopper's Designer can read it", async () => {
    getDbMock.mockResolvedValue(null);
    const anonymous = doorStylesRouter.createCaller({ user: null } as never);
    await expect(anonymous.acceptedAppearance({ styleId: 330011 })).resolves.toMatchObject({ styleId: 330011 });
  });
});
