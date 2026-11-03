import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, getTableName } from "drizzle-orm";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("../lib/doorRenderingAuditScore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/doorRenderingAuditScore")>();
  return { ...actual, imageUrlToDataUrl: vi.fn(async () => "data:image/png;base64,iVBORw0KGgo=") };
});
vi.mock("../lib/colorSampler", () => ({
  extractDominantColor: vi.fn(async () => "d9c9a3"),
}));

import { doorRenderingAuditRouter } from "./doorRenderingAudit";
import { resetDoorRenderingApprovalSchemaCache } from "../lib/doorRenderingApprovalSchema";
import { resetAcceptedDoorAppearanceCache } from "../lib/acceptedDoorAppearance";

/** The approval columns already exist, so the schema probe is satisfied. */
const READY_SCHEMA_ROWS = [
  { tableName: "door_rendering_versions", columnName: "source", columnType: "enum('audit','designer','featured')" },
  { tableName: "door_rendering_versions", columnName: "renderHex", columnType: "varchar(16)" },
  { tableName: "door_rendering_versions", columnName: "approvedDoorImageUrl", columnType: "varchar(512)" },
  { tableName: "door_rendering_versions", columnName: "approvedDrawerImageUrl", columnType: "varchar(512)" },
  { tableName: "door_rendering_version_events", columnName: "action", columnType: "enum('accepted','rejected','reverted','revoked')" },
];

type Version = {
  id: number;
  styleId: number;
  runId: number | null;
  renderImageUrl: string;
  samplePhotoUrl: string;
  overallScore: number;
  acceptedOverallScore: number | null;
  scoreDelta: number | null;
  verdict: string;
  notes: string | null;
  source: string;
  renderHex: string | null;
  approvedDoorImageUrl: string | null;
  approvedDrawerImageUrl: string | null;
  woodGrainScore: number;
  colorScore: number;
  textureSheenScore: number;
  profileEdgesScore: number;
  renderingCommit: string | null;
  renderImageKey: string | null;
  createdAt: Date;
};

const version = (over: Partial<Version> = {}): Version => ({
  id: 41,
  styleId: 330011,
  runId: 9,
  // Shaker Honey (SH, Madison) was drawn on the flat catalog hex #c8a040.
  renderImageUrl: "/manus-storage/door-rendering-audit/style-330011/run-9.png",
  samplePhotoUrl: "/manus-storage/samples/sh.jpg",
  overallScore: 10,
  acceptedOverallScore: null,
  scoreDelta: null,
  verdict: "not_flagged",
  notes: null,
  source: "audit",
  renderHex: "#c8a040",
  approvedDoorImageUrl: null,
  approvedDrawerImageUrl: null,
  woodGrainScore: 10,
  colorScore: 10,
  textureSheenScore: 10,
  profileEdgesScore: 10,
  renderingCommit: null,
  renderImageKey: null,
  createdAt: new Date("2026-11-03T20:00:00Z"),
  ...over,
});

function stubDb(input: { versions: Version[]; events?: Array<Record<string, unknown>>; styleRenderHex?: string | null }) {
  const styleUpdates: Array<Record<string, unknown>> = [];
  const inserted: Array<Record<string, unknown>> = [];
  let nextEventId = 500;

  const chain = (rows: unknown[]) => {
    const promise = Promise.resolve(rows);
    return {
      limit: () => promise,
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
    };
  };

  const db = {
    execute: async () => READY_SCHEMA_ROWS,
    select: () => ({
      from: (table: unknown) => {
        const name = getTableName(table as Parameters<typeof getTableName>[0]);
        return {
          where: () => {
            if (name === "door_rendering_versions") return chain(input.versions);
            if (name === "door_rendering_version_events") return chain(input.events ?? []);
            if (name === "door_styles") return chain([{ renderHex: input.styleRenderHex ?? null }]);
            return chain([]);
          },
        };
      },
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        inserted.push(values);
        return [{ insertId: nextEventId++ }];
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (getTableName(table as Parameters<typeof getTableName>[0]) === "door_styles") styleUpdates.push(values);
          return [{ affectedRows: 1 }];
        },
      }),
    }),
  };
  return { db, styleUpdates, inserted };
}

const ADMIN = { id: 7, openId: "admin-accepted-run", name: "Admin", email: "admin@shop.test", role: "admin" };
const caller = () => doorRenderingAuditRouter.createCaller({
  user: ADMIN,
  req: { headers: {} },
  res: {},
} as never);

beforeEach(() => {
  getDbMock.mockReset();
  resetDoorRenderingApprovalSchemaCache();
  resetAcceptedDoorAppearanceCache();
});

describe("accepting a run writes it back to the door style", () => {
  it("stores the render image and the color read off that image, not the catalog hex", async () => {
    const { db, styleUpdates, inserted } = stubDb({ versions: [version()] });
    getDbMock.mockResolvedValue(db);

    const result = await caller().approveRender({ versionId: 41 });

    expect(result.acceptedVersionId).toBe(41);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ styleId: 330011, versionId: 41, action: "accepted" });
    expect(styleUpdates).toHaveLength(1);
    expect(styleUpdates[0]).toEqual({
      renderHex: "#d9c9a3",
      approvedReferenceImageUrl: "/manus-storage/door-rendering-audit/style-330011/run-9.png",
      approvedVersionId: 41,
      approvedAt: expect.any(Date),
    });
    // The old behavior wrote the run's own renderHex, which was the flat catalog hex.
    expect((styleUpdates[0] as { renderHex: string }).renderHex).not.toBe("#c8a040");
  });

  it("uses the approved door photo when the approval captured one", async () => {
    const { db, styleUpdates } = stubDb({
      versions: [version({ source: "featured", approvedDoorImageUrl: "/manus-storage/approved-door.png" })],
    });
    getDbMock.mockResolvedValue(db);
    await caller().approveRender({ versionId: 41 });
    expect(styleUpdates[0]).toMatchObject({
      approvedReferenceImageUrl: "/manus-storage/approved-door.png",
      approvedVersionId: 41,
    });
  });

  it("still records the approval when the style writeback fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = stubDb({ versions: [version()] });
    db.update = (() => ({
      set: () => ({ where: async () => { throw new Error("Unknown column 'approvedAt' in 'field list'"); } }),
    })) as never;
    getDbMock.mockResolvedValue(db);

    await expect(caller().approveRender({ versionId: 41 })).resolves.toMatchObject({ acceptedVersionId: 41 });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("revoking or reverting moves the appearance with the approval", () => {
  it("clears the approval marker and the color it wrote", async () => {
    const accepted = version({ id: 41 });
    const { db, styleUpdates } = stubDb({
      versions: [accepted],
      events: [
        { id: 1, styleId: 330011, versionId: 41, action: "accepted" },
      ],
      styleRenderHex: "#d9c9a3",
    });
    getDbMock.mockResolvedValue(db);

    await caller().revokeApproval({ styleId: 330011 });

    expect(styleUpdates).toHaveLength(1);
    expect(styleUpdates[0]).toEqual({
      approvedReferenceImageUrl: null,
      approvedVersionId: null,
      approvedAt: null,
      renderHex: null,
    });
  });

  it("re-points at the older version a revert chose", async () => {
    const older = version({ id: 39, renderImageUrl: "/manus-storage/door-rendering-audit/style-330011/run-7.png" });
    const newer = version({ id: 41, overallScore: 11 });
    const { db, styleUpdates } = stubDb({
      versions: [older, newer],
      events: [{ id: 1, styleId: 330011, versionId: 41, action: "accepted" }],
    });
    getDbMock.mockResolvedValue(db);

    const result = await caller().revertToVersion({ versionId: 39 });

    expect(result.acceptedVersionId).toBe(39);
    expect(styleUpdates).toHaveLength(1);
    expect(styleUpdates[0]).toMatchObject({
      approvedVersionId: 39,
      approvedReferenceImageUrl: older.renderImageUrl,
      renderHex: "#d9c9a3",
    });
  });

  it("rejecting a render leaves the accepted appearance untouched", async () => {
    const accepted = version({ id: 39 });
    const rejected = version({ id: 41, overallScore: 4 });
    const { db, styleUpdates } = stubDb({
      versions: [accepted, rejected],
      events: [{ id: 1, styleId: 330011, versionId: 39, action: "accepted" }],
    });
    getDbMock.mockResolvedValue(db);

    await caller().decideRender({ versionId: 41, decision: "reject" });
    expect(styleUpdates).toHaveLength(0);
  });
});

describe("a shopper cannot write an acceptance", () => {
  it("blocks a non-admin from approveRender and revokeApproval", async () => {
    getDbMock.mockResolvedValue(stubDb({ versions: [version()] }).db);
    const shopper = doorRenderingAuditRouter.createCaller({
      user: { id: 8, openId: "shopper", name: "Shopper", email: "shopper@shop.test", role: "user" },
      req: { headers: {} },
      res: {},
    } as never);
    await expect(shopper.approveRender({ versionId: 41 })).rejects.toThrow();
    await expect(shopper.revokeApproval({ styleId: 330011 })).rejects.toThrow();
  });
});

// Keeps the imported helper meaningful if drizzle's column identity ever changes.
expect(getTableName.toString()).toContain("getTableName");
expect(typeof eq).toBe("function");
