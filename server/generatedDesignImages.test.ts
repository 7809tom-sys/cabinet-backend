import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/routers/generatedDesignImages.ts"), "utf8");
const rootRouter = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("generated design image library contracts", () => {
  it("keeps deterministic and completed Gemini images in one administrator review folder", () => {
    expect(source).toContain('source: "deterministic"');
    expect(source).toContain('source: "gemini"');
    expect(source).toContain('eq(designGeminiImageTestJobs.status, "completed")');
    expect(source).toContain("customerBySignature");
    expect(source).toContain("originatorName");
    expect(source).toContain("cabinetName");
  });

  it("requires an explicit administrator carousel action rather than publishing images at generation time", () => {
    expect(source).toContain("setRoomSceneCarousel: adminProcedure");
    expect(source).toContain("Choose a valid Door Style before adding this image to the room-scene carousel.");
    expect(source).toContain("isActive: true");
    expect(source).toContain("isActive: false");
    expect(source).toContain("generated-design-image:");
  });

  it("keeps one exact generated kitchen associated with only one approved cabinet finish", () => {
    expect(source).toContain("const sourceScenes = await db.select");
    expect(source).toContain("const otherSourceSceneIds = sourceScenes.filter");
    expect(source).toContain("await db.delete(doorStyleRoomScenes).where(inArray(doorStyleRoomScenes.id, otherSourceSceneIds))");
    expect(source).toContain("scene.isActive && !current.isActive");
  });

  it("registers the review folder as a root tRPC service", () => {
    expect(rootRouter).toContain('import { generatedDesignImagesRouter } from "./routers/generatedDesignImages";');
    expect(rootRouter).toContain("generatedDesignImages: generatedDesignImagesRouter");
  });
});
