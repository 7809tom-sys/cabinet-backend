import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DryRunChannelAdapter } from "./channelAdapter";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const statements = (text: string) =>
  text.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("--"));

describe("library commercial SQL files", () => {
  it("adds the hash, tags, and publish tables without deleting anything", () => {
    const sql = read("docs/sql/0273_library_commercials_content_hash.tidb.sql");
    expect(sql).toContain("ADD COLUMN contentSha256 VARCHAR(64) NULL");
    expect(sql).toContain("affiliate_literature_content_sha256_idx");
    expect(sql).toMatch(/not unique/i);
    expect(sql).toContain("CREATE TABLE cabinet_dealz.affiliate_literature_tags");
    expect(sql).toContain("CREATE TABLE cabinet_dealz.library_commercial_publishes");
    for (const line of statements(sql)) {
      expect(line.endsWith(";")).toBe(true);
      expect(line).not.toMatch(/^(DELETE|DROP|UPDATE|INSERT)\b/i);
      expect(line).not.toMatch(/IF NOT EXISTS/i);
    }
  });

  it("lists duplicates with selects only, and says there is no hash until 0273", () => {
    const sql = read("docs/sql/0274_library_duplicate_files_readonly.tidb.sql");
    expect(sql).toContain("does NOT have a content hash");
    expect(sql).toContain("affiliate_literature");
    expect(sql).toContain("affiliate_resources");
    expect(sql).toContain("GROUP BY filename, sizeBytes");
    expect(sql).toContain("GROUP BY contentSha256");
    for (const line of statements(sql)) {
      expect(line.startsWith("SELECT ")).toBe(true);
    }
  });

  it("keeps the hash script as a printer of updates, not a delete", () => {
    const script = read("scripts/hash-library-files.ts");
    expect(script).toContain("It does not execute the UPDATE");
    expect(script).toContain("libraryHashUpdateStatement");
    expect(script).not.toContain("storageDelete");
    expect(script).not.toContain(".delete(");
    const store = read("server/commercials/sqlStore.ts");
    expect(store).not.toContain("storageDelete");
    expect(store).not.toContain("delete(affiliateLiterature)");
    const service = read("server/commercials/service.ts");
    expect(service).not.toContain("storageDelete");
    expect(service).toContain("LIBRARY_DOCUMENT_FILE_PREFIX");
  });
});

describe("dry-run channel adapter", () => {
  it("posts nothing and does not call the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
    const result = await new DryRunChannelAdapter("x").publish({
      channel: "x",
      commercialId: 3,
      title: "Spot",
      caption: null,
      fileUrl: "/manus-storage/library-documents/commercials/spot.mp4",
      mimeType: "video/mp4",
      durationSeconds: 15,
    });
    expect(result).toEqual({
      ok: false,
      externalPostId: null,
      externalPostUrl: null,
      error: "Dry run: nothing was posted to x. No social account is connected.",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    const source = read("server/commercials/channelAdapter.ts");
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
