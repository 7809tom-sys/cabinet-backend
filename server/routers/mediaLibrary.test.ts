import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

function adminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "media-library-safety-regression-admin",
      name: "Media Library Safety Regression Admin",
      email: "admin@example.com",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Media Library reference safety", () => {
  it("blocks deletion of a media record that is still referenced by stored content", () => {
    const source = readFileSync(new URL("./mediaLibrary.ts", import.meta.url), "utf8");

    expect(source).toContain("async function findMediaReferences");
    expect(source).toContain("FROM information_schema.columns");
    expect(source).toContain("data_type IN ('char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'json')");
    expect(source).toContain("const references = await findMediaReferences(db, media)");
    expect(source).toContain('code: "CONFLICT"');
    expect(source.indexOf("const references = await findMediaReferences")).toBeLessThan(
      source.indexOf("await db.delete(mediaImages)")
    );
  });

  it("rejects deletion of an image actively used by a saved cabinet record", async () => {
    const caller = appRouter.createCaller(adminContext());

    await expect(caller.mediaLibrary.delete({ id: 30001 })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
