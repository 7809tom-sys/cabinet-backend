import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  DOOR_RENDERING_APPROVAL_ALTERS,
  DOOR_RENDERING_APPROVAL_MIGRATION,
  databaseErrorDetail,
  doorRenderingApprovalSchemaState,
  isMissingDoorRenderingApprovalColumn,
  resetDoorRenderingApprovalSchemaCache,
} from "./doorRenderingApprovalSchema";
import {
  doorStyleSaveShouldRecordVersion,
  recordDoorStyleSaveVersion,
  recordFeaturedDoorVersion,
} from "./featuredDoorStyleVersion";

describe("door rendering approval schema", () => {
  it("matches the hand-run 0241 migration", () => {
    const sql = readFileSync(DOOR_RENDERING_APPROVAL_MIGRATION, "utf8");
    expect(sql).toContain("ENUM('audit','designer','featured')");
    expect(sql).toContain("renderHex VARCHAR(16)");
    expect(sql).toContain("approvedDoorImageUrl VARCHAR(512)");
    expect(sql).toContain("approvedDrawerImageUrl VARCHAR(512)");
    expect(sql).toContain("ENUM('accepted','rejected','reverted','revoked')");
    expect(DOOR_RENDERING_APPROVAL_ALTERS.join("\n")).toContain(
      "ADD COLUMN IF NOT EXISTS `source`"
    );
    expect(DOOR_RENDERING_APPROVAL_ALTERS.join("\n")).toContain(
      "MODIFY COLUMN `source`"
    );
    expect(DOOR_RENDERING_APPROVAL_ALTERS.join("\n")).toContain("'featured'");
    expect(DOOR_RENDERING_APPROVAL_ALTERS.join("\n")).toContain("'revoked'");
  });

  it("treats a source enum without featured as not ready", () => {
    expect(
      doorRenderingApprovalSchemaState([
        {
          tableName: "door_rendering_versions",
          columnName: "source",
          columnType: "enum('audit','designer')",
        },
        {
          tableName: "door_rendering_versions",
          columnName: "renderHex",
          columnType: "varchar(16)",
        },
        {
          tableName: "door_rendering_versions",
          columnName: "approvedDoorImageUrl",
          columnType: "varchar(512)",
        },
        {
          tableName: "door_rendering_versions",
          columnName: "approvedDrawerImageUrl",
          columnType: "varchar(512)",
        },
        {
          tableName: "door_rendering_version_events",
          columnName: "action",
          columnType: "enum('accepted','rejected','reverted')",
        },
      ])
    ).toEqual({ versionsReady: false, eventsReady: false });
  });

  it("is ready when featured and revoked are both in the enums", () => {
    expect(
      doorRenderingApprovalSchemaState([
        {
          tableName: "door_rendering_versions",
          columnName: "source",
          columnType: "enum('audit','designer','featured')",
        },
        {
          tableName: "door_rendering_versions",
          columnName: "renderHex",
          columnType: "varchar(16)",
        },
        {
          tableName: "door_rendering_versions",
          columnName: "approvedDoorImageUrl",
          columnType: "varchar(512)",
        },
        {
          tableName: "door_rendering_versions",
          columnName: "approvedDrawerImageUrl",
          columnType: "varchar(512)",
        },
        {
          tableName: "door_rendering_version_events",
          columnName: "action",
          columnType: "enum('accepted','rejected','reverted','revoked')",
        },
      ])
    ).toEqual({ versionsReady: true, eventsReady: true });
  });

  it("reads the MySQL error under Drizzle's Failed query wrapper", () => {
    const error = Object.assign(
      new Error(
        "Failed query: insert into `door_rendering_versions` (...) values (default, ?, ...)"
      ),
      {
        cause: {
          errno: 1054,
          code: "ER_BAD_FIELD_ERROR",
          sqlMessage: "Unknown column 'source' in 'INSERT INTO'",
        },
      }
    );
    expect(databaseErrorDetail(error)).toBe(
      "Unknown column 'source' in 'INSERT INTO'"
    );
    expect(isMissingDoorRenderingApprovalColumn(error)).toBe(true);
    expect(
      isMissingDoorRenderingApprovalColumn({
        errno: 1265,
        sqlMessage: "Data truncated for column 'source' at row 1",
      })
    ).toBe(true);
  });
});

describe("featured door style version on save", () => {
  it("records a version only when the door photo, drawer photo, or render hex changed", () => {
    const previous = {
      doorSampleImageUrl: "/door.png",
      drawerSampleImageUrl: "/drawer.png",
      renderHex: "#798764",
    };
    expect(
      doorStyleSaveShouldRecordVersion({ ourName: "White" }, previous)
    ).toBe(false);
    expect(
      doorStyleSaveShouldRecordVersion({ renderHex: "#798764" }, previous)
    ).toBe(false);
    expect(
      doorStyleSaveShouldRecordVersion({ renderHex: "#112233" }, previous)
    ).toBe(true);
    expect(
      doorStyleSaveShouldRecordVersion(
        { doorSampleImageUrl: "/new.png" },
        previous
      )
    ).toBe(true);
    expect(
      doorStyleSaveShouldRecordVersion({ drawerSampleImageUrl: null }, previous)
    ).toBe(true);
  });

  it("does not throw when the version insert fails", async () => {
    resetDoorRenderingApprovalSchemaCache();
    const error = console.error;
    console.error = vi.fn();
    try {
      const db = {
        execute: async () => {
          throw Object.assign(new Error("Failed query: alter"), {
            cause: {
              sqlMessage: "Unknown column 'source' in 'INSERT INTO'",
              errno: 1054,
            },
          });
        },
      };
      let scored = false;
      const result = await recordFeaturedDoorVersion(
        db as never,
        {
          styleId: 330005,
          actorUserId: 7,
          doorImageUrl: "/manus-storage/media-library/door.png",
          drawerImageUrl: "/manus-storage/media-library/drawer.png",
          renderHex: "#798764",
        },
        async () => {
          scored = true;
          return {
            scores: {
              woodGrain: 10,
              color: 10,
              textureSheen: 10,
              profileEdges: 10,
              overall: 10,
            },
            notes: "",
          };
        }
      );
      expect(result).toEqual({ recorded: false, versionId: null });
      expect(scored).toBe(false);
    } finally {
      console.error = error;
      resetDoorRenderingApprovalSchemaCache();
    }
  });

  it("leaves the door style save alone when nothing visual changed, even if the database throws", async () => {
    await expect(
      recordDoorStyleSaveVersion(
        {
          select: () => {
            throw new Error("database down");
          },
        } as never,
        {
          styleId: 1,
          actorUserId: 7,
          patch: { ourName: "White Shaker" },
          previous: {
            doorSampleImageUrl: "/door.png",
            drawerSampleImageUrl: null,
            renderHex: null,
          },
        }
      )
    ).resolves.toBeUndefined();
  });

  it("does not fail the save when loading the style for a version row throws", async () => {
    const error = console.error;
    console.error = vi.fn();
    try {
      await expect(
        recordDoorStyleSaveVersion(
          {
            select: () => {
              throw Object.assign(
                new Error(
                  "Failed query: select `renderHex` from `door_styles`"
                ),
                {
                  cause: {
                    sqlMessage: "Unknown column 'renderHex' in 'door_styles'",
                  },
                }
              );
            },
          } as never,
          {
            styleId: 330005,
            actorUserId: 7,
            patch: { renderHex: "#112233" },
            previous: {
              doorSampleImageUrl: "/door.png",
              drawerSampleImageUrl: null,
              renderHex: null,
            },
          }
        )
      ).resolves.toBeUndefined();
    } finally {
      console.error = error;
    }
  });

  it("wires the save through the non-blocking recorder and prepares the approval columns before insert", () => {
    const catalog = readFileSync(
      new URL("../routers/catalog.ts", import.meta.url),
      "utf8"
    );
    const audit = readFileSync(
      new URL("../routers/doorRenderingAudit.ts", import.meta.url),
      "utf8"
    );
    const save = catalog.slice(
      catalog.indexOf("adminUpdateDoorStyle:"),
      catalog.indexOf("addRoomScene:")
    );
    expect(save).toContain("recordDoorStyleSaveVersion");
    expect(audit).toContain("ensureDoorRenderingApprovalColumns(db)");
    expect(audit).toContain("The door style version was not recorded.");
  });
});

const testDatabaseUrl = process.env.DOOR_VERSION_TEST_URL;

describe.skipIf(!testDatabaseUrl)("featured door version against MySQL", () => {
  it("adds the 0241 columns to a 0223 table and records the featured row", async () => {
    resetDoorRenderingApprovalSchemaCache();
    const mysql = await import("mysql2/promise");
    const { drizzle } = await import("drizzle-orm/mysql2");
    const connection = await mysql.createConnection(testDatabaseUrl!);
    await connection.query(
      "DROP TABLE IF EXISTS door_rendering_version_events"
    );
    await connection.query("DROP TABLE IF EXISTS door_rendering_versions");
    await connection.query(`
      CREATE TABLE door_rendering_versions (
        id INT NOT NULL AUTO_INCREMENT,
        styleId INT NOT NULL,
        runId INT NULL,
        renderingCommit VARCHAR(128) NULL,
        samplePhotoUrl VARCHAR(512) NOT NULL,
        renderImageUrl VARCHAR(512) NOT NULL,
        renderImageKey VARCHAR(512) NULL,
        woodGrainScore INT NOT NULL,
        colorScore INT NOT NULL,
        textureSheenScore INT NOT NULL,
        profileEdgesScore INT NOT NULL,
        overallScore INT NOT NULL,
        acceptedOverallScore INT NULL,
        scoreDelta INT NULL,
        verdict ENUM('flagged','not_flagged','no_baseline') NOT NULL,
        notes VARCHAR(512) NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      )
    `);
    await connection.query(`
      CREATE TABLE door_rendering_version_events (
        id INT NOT NULL AUTO_INCREMENT,
        styleId INT NOT NULL,
        versionId INT NOT NULL,
        action ENUM('accepted','rejected','reverted') NOT NULL,
        actorUserId INT NOT NULL,
        note VARCHAR(512) NULL,
        previousAcceptedVersionId INT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      )
    `);
    const door =
      "/manus-storage/media-library/1786572550215_screenshot_2026_08_12_170856_d2f96aba";
    const drawer =
      "/manus-storage/media-library/1786572506414_screenshot_2026_08_12_170137_aa19a572";
    const db = drizzle(connection);
    const result = await recordFeaturedDoorVersion(
      db as never,
      {
        styleId: 330005,
        actorUserId: 7,
        doorImageUrl: door,
        drawerImageUrl: drawer,
        renderHex: "#798764",
      },
      async () => ({
        scores: {
          woodGrain: 10,
          color: 10,
          textureSheen: 10,
          profileEdges: 10,
          overall: 10,
        },
        notes: "",
      })
    );
    expect(result.recorded).toBe(true);
    const [rows] = await connection.query(
      "SELECT styleId, runId, renderingCommit, renderImageKey, acceptedOverallScore, scoreDelta, verdict, notes, source, renderHex, approvedDoorImageUrl, approvedDrawerImageUrl FROM door_rendering_versions"
    );
    expect(rows).toMatchObject([
      {
        styleId: 330005,
        runId: null,
        renderingCommit: null,
        renderImageKey: null,
        acceptedOverallScore: null,
        scoreDelta: null,
        verdict: "no_baseline",
        notes: null,
        source: "featured",
        renderHex: "#798764",
        approvedDoorImageUrl: door,
        approvedDrawerImageUrl: drawer,
      },
    ]);
    const [events] = await connection.query(
      "SELECT action, styleId, versionId FROM door_rendering_version_events"
    );
    expect(events).toMatchObject([
      { action: "accepted", styleId: 330005, versionId: result.versionId },
    ]);
    await connection.end();
    resetDoorRenderingApprovalSchemaCache();
  });

  it("widens a source enum that was created without featured", async () => {
    resetDoorRenderingApprovalSchemaCache();
    const mysql = await import("mysql2/promise");
    const { drizzle } = await import("drizzle-orm/mysql2");
    const connection = await mysql.createConnection(testDatabaseUrl!);
    await connection.query(
      "DROP TABLE IF EXISTS door_rendering_version_events"
    );
    await connection.query("DROP TABLE IF EXISTS door_rendering_versions");
    await connection.query(`
      CREATE TABLE door_rendering_versions (
        id INT NOT NULL AUTO_INCREMENT,
        styleId INT NOT NULL,
        runId INT NULL,
        renderingCommit VARCHAR(128) NULL,
        samplePhotoUrl VARCHAR(512) NOT NULL,
        renderImageUrl VARCHAR(512) NOT NULL,
        renderImageKey VARCHAR(512) NULL,
        woodGrainScore INT NOT NULL,
        colorScore INT NOT NULL,
        textureSheenScore INT NOT NULL,
        profileEdgesScore INT NOT NULL,
        overallScore INT NOT NULL,
        acceptedOverallScore INT NULL,
        scoreDelta INT NULL,
        verdict ENUM('flagged','not_flagged','no_baseline') NOT NULL,
        notes VARCHAR(512) NULL,
        source ENUM('audit','designer') NOT NULL DEFAULT 'audit',
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      )
    `);
    await connection.query(`
      CREATE TABLE door_rendering_version_events (
        id INT NOT NULL AUTO_INCREMENT,
        styleId INT NOT NULL,
        versionId INT NOT NULL,
        action ENUM('accepted','rejected','reverted') NOT NULL,
        actorUserId INT NOT NULL,
        note VARCHAR(512) NULL,
        previousAcceptedVersionId INT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      )
    `);
    const blocked = await connection
      .query(
        "INSERT INTO door_rendering_versions (styleId, samplePhotoUrl, renderImageUrl, woodGrainScore, colorScore, textureSheenScore, profileEdgesScore, overallScore, verdict, source) VALUES (1, '/a', '/b', 10, 10, 10, 10, 10, 'no_baseline', 'featured')"
      )
      .then(
        () => "",
        (error: { code?: string; sqlMessage?: string }) =>
          error.sqlMessage ?? error.code ?? "failed"
      );
    expect(blocked).toMatch(/Data truncated for column 'source'/);
    const db = drizzle(connection);
    const result = await recordFeaturedDoorVersion(
      db as never,
      {
        styleId: 330005,
        actorUserId: 7,
        doorImageUrl: "/door.png",
        drawerImageUrl: null,
        renderHex: "#798764",
      },
      async () => ({
        scores: {
          woodGrain: 10,
          color: 10,
          textureSheen: 10,
          profileEdges: 10,
          overall: 10,
        },
        notes: "",
      })
    );
    expect(result).toMatchObject({ recorded: true });
    const [rows] = await connection.query(
      "SELECT source, renderHex, approvedDoorImageUrl FROM door_rendering_versions WHERE styleId = 330005"
    );
    expect(rows).toMatchObject([
      {
        source: "featured",
        renderHex: "#798764",
        approvedDoorImageUrl: "/door.png",
      },
    ]);
    await connection.end();
    resetDoorRenderingApprovalSchemaCache();
  });
});
