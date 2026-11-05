/**
 * The automatic room-scene prompt must be built from the color of record and
 * the profile details that are actually filled in, not from the free-text
 * `doorStyle` / `color` fields alone.
 *
 * Safety: no image provider is called. The generator is a stub.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildDoorStyleRoomScenePrompt,
  colorOfRecordSentence,
  profileDetailSentences,
  type RoomSceneColorOfRecord,
} from "../shared/doorStyleRoomSceneGeneration";
import {
  normalizeRoomSceneHex,
  roomSceneColorOfRecord,
  roomScenePromptStyle,
  roomSceneReferenceUrls,
  type DoorStyleSampleRow,
} from "./doorStyleRoomSceneGeneration";

function style(overrides: Partial<DoorStyleSampleRow> = {}): DoorStyleSampleRow {
  return {
    id: 7,
    distributorId: 3,
    ourName: "Lumina Blanc",
    doorStyle: "Shaker",
    finish: "Painted",
    color: "White",
    doorSampleImageUrl: "https://cdn.example/door.jpg",
    drawerSampleImageUrl: "https://cdn.example/drawer.jpg",
    doorSampleVerified: true,
    drawerSampleVerified: true,
    roomSceneImageUrl: null,
    ...overrides,
  };
}

describe("color of record", () => {
  it("normalizes a 6-digit hex and rejects anything else", () => {
    expect(normalizeRoomSceneHex("#AABBCC")).toBe("#aabbcc");
    expect(normalizeRoomSceneHex("aabbcc")).toBe("#aabbcc");
    expect(normalizeRoomSceneHex("#abc")).toBeNull();
    expect(normalizeRoomSceneHex("Blue")).toBeNull();
    expect(normalizeRoomSceneHex(null)).toBeNull();
  });

  it("lets an approved render's hex win over the free-text color", () => {
    const color = roomSceneColorOfRecord(style({
      color: "Blue",
      renderHex: "#3f4a5a",
      approvedVersionId: 44,
    }));
    expect(color).toEqual({ hex: "#3f4a5a", label: "Blue", source: "approved-render" });
  });

  it("uses the style's own hex when nothing is approved", () => {
    const color = roomSceneColorOfRecord(style({ color: "Blue", renderHex: "#123456", approvedVersionId: null }));
    expect(color).toEqual({ hex: "#123456", label: "Blue", source: "style-record" });
  });

  it("ignores renderHex when there is no approval marker", () => {
    // A typed renderHex is not an approval; it is still a style-record hex.
    expect(roomSceneColorOfRecord(style({ renderHex: "#123456", approvedVersionId: null })).source).toBe("style-record");
  });

  it("has no hex rather than inventing one from a color name", () => {
    const color = roomSceneColorOfRecord(style({ color: "Blue", renderHex: null }));
    expect(color).toEqual({ hex: null, label: "Blue", source: "none" });
  });

  it("states the exact hex and names the approved render as its source", () => {
    const approved: RoomSceneColorOfRecord = { hex: "#3f4a5a", label: "Naval (SW 6244)", source: "approved-render" };
    const sentence = colorOfRecordSentence(approved)!;
    expect(sentence).toContain("exactly Naval (SW 6244) (#3f4a5a)");
    expect(sentence).toContain("approved door render");
    expect(sentence).toContain("do not substitute, tint, brighten, or snap it to a brand palette");
  });

  it("names the style record when that is where the hex came from", () => {
    const sentence = colorOfRecordSentence({ hex: "#123456", label: null, source: "style-record" })!;
    expect(sentence).toContain("exactly #123456");
    expect(sentence).toContain("recorded on this door style");
  });

  it("produces no color sentence without a hex", () => {
    expect(colorOfRecordSentence({ hex: null, label: "Blue", source: "none" })).toBeNull();
    expect(colorOfRecordSentence(null)).toBeNull();
  });
});

describe("profile details", () => {
  it("describes only the fields that are filled in", () => {
    const sentences = profileDetailSentences({
      doorStyle: "Shaker",
      doorShape: "recessed-shaker",
      panelConstruction: "flat",
      insideEdgeProfile: "ogee",
      railWidth: "2.25",
      stileWidth: 2.25,
      drawerFrontType: "five-piece-flat",
      finish: "Painted",
      finishSheen: "satin",
    });
    expect(sentences).toEqual([
      "Door style: Shaker / recessed-shaker.",
      "Door panel construction: flat.",
      "Inside edge profile: ogee.",
      "Face frame proportions: rail 2.25 inches, stile 2.25 inches.",
      "Drawer front type: five-piece-flat.",
      "Finish: Painted, satin.",
    ]);
  });

  it("never invents a blank field", () => {
    expect(profileDetailSentences({})).toEqual([]);
    expect(profileDetailSentences({ doorStyle: null, railWidth: 0, stileWidth: null })).toEqual([]);
  });

  it("skips a duplicate panel value instead of repeating it", () => {
    expect(profileDetailSentences({ panelConstruction: "flat", doorPanelType: "flat" }))
      .toEqual(["Door panel construction: flat."]);
  });
});

describe("prompt composition", () => {
  it("puts the color of record first and makes it beat the photos", () => {
    const prompt = buildDoorStyleRoomScenePrompt({
      ourName: "Lumina Blanc",
      colorOfRecord: { hex: "#3f4a5a", label: "Naval (SW 6244)", source: "approved-render" },
      approvedRenderIsReference: true,
      doorStyle: "Shaker",
    });
    const colorAt = prompt.indexOf("exactly Naval (SW 6244) (#3f4a5a)");
    expect(colorAt).toBeGreaterThan(-1);
    expect(prompt).toContain("If a reference photo's cabinet color differs in any way from the color stated above, the stated color value wins");
    expect(prompt.indexOf("stated color value wins")).toBeGreaterThan(colorAt);
    // The approved render leads the reference list.
    expect(prompt).toContain("The first reference image is the door render approved for this style.");
  });

  it("does not claim an approved render when none exists", () => {
    const prompt = buildDoorStyleRoomScenePrompt({
      ourName: "Lumina Blanc",
      colorOfRecord: { hex: "#123456", label: "Blue", source: "style-record" },
    });
    expect(prompt).not.toContain("door render approved for this style");
    expect(prompt).toContain("The second reference image is the verified drawer front");
    expect(prompt).toContain("stated color value wins");
  });

  it("falls back to the door photo's color when no hex is recorded", () => {
    const prompt = buildDoorStyleRoomScenePrompt({
      ourName: "Lumina Blanc",
      colorOfRecord: { hex: null, label: "Blue", source: "none" },
    });
    expect(prompt).not.toContain("Paint every cabinet door");
    expect(prompt).toContain("follow the door photo's color");
    // The free-text name is never used as the color instruction on its own.
    expect(prompt).not.toContain("Color: Blue");
  });

  it("keeps the cabinetry shape instruction and the no-paste rule", () => {
    const prompt = buildDoorStyleRoomScenePrompt({ ourName: "Lumina Blanc" });
    // The shape reference is always named, even with no profile data at all.
    expect(prompt).toContain("it is the shape reference");
    expect(prompt).toContain("verified drawer front");
    expect(prompt).toContain("do not paste the reference photos into the frame");
    expect(prompt).toContain("L-shaped kitchen with base cabinets, drawers, and wall cabinets");
  });
});

describe("reference images", () => {
  it("passes the approved render first, then the door and drawer photos", () => {
    expect(roomSceneReferenceUrls(style({
      approvedVersionId: 12,
      approvedReferenceImageUrl: "https://cdn.example/approved.png",
    }))).toEqual([
      "https://cdn.example/approved.png",
      "https://cdn.example/door.jpg",
      "https://cdn.example/drawer.jpg",
    ]);
  });

  it("ignores an approved image when the approval marker is missing", () => {
    expect(roomSceneReferenceUrls(style({
      approvedVersionId: null,
      approvedReferenceImageUrl: "https://cdn.example/approved.png",
    }))).toEqual(["https://cdn.example/door.jpg", "https://cdn.example/drawer.jpg"]);
  });

  it("does not pass the same URL twice", () => {
    expect(roomSceneReferenceUrls(style({
      approvedVersionId: 12,
      approvedReferenceImageUrl: "https://cdn.example/door.jpg",
    }))).toEqual(["https://cdn.example/door.jpg", "https://cdn.example/drawer.jpg"]);
  });

  it("builds one prompt input so the prompt and the audit agree", () => {
    const input = roomScenePromptStyle(style({ renderHex: "#3f4a5a", approvedVersionId: 9, approvedReferenceImageUrl: "https://cdn.example/a.png" }));
    expect(input.colorOfRecord).toMatchObject({ hex: "#3f4a5a", source: "approved-render" });
    expect(input.approvedRenderIsReference).toBe(true);
    expect(input.drawerFrontType).toBeUndefined();
  });
});

describe("prompt audit record", () => {
  const source = readFileSync(resolve(process.cwd(), "server/doorStyleRoomSceneGeneration.ts"), "utf8");

  it("records the exact prompt on the generation job", () => {
    const start = source.indexOf("export async function applyDoorStyleRoomSceneGeneration");
    const body = source.slice(start, source.indexOf("type Db = NonNullable"));
    expect(body).toContain("const prompt = doorStyleRoomScenePrompt(promptStyle)");
    expect(body).toContain("await recordPrompt(store, styleId, token, prompt)");
    // The prompt is stored even when generation fails, so a failure is traceable.
    const catchIndex = body.indexOf('return recordFailure(store, styleId, token, failureMessage(error), log)');
    const promptBeforeCatch = body.lastIndexOf("await recordPrompt(store, styleId, token, prompt)", catchIndex);
    expect(promptBeforeCatch).toBeGreaterThan(-1);
  });

  it("sends the reference URLs it resolved rather than only the two photos", () => {
    expect(source).toContain("const referenceUrls = roomSceneReferenceUrls(style)");
    expect(source).toContain("originalImages: referenceUrls.map((url) => ({ url }))");
  });

  it("only records the prompt for the job that still owns the claim", () => {
    const start = source.indexOf("async function recordPrompt");
    const body = source.slice(start, start + 900);
    expect(body).toContain("current?.claimToken !== token");
  });

  it("ships the prompt column as SQL Tom runs himself", () => {
    const tidb = readFileSync(resolve(process.cwd(), "docs/sql/0249_room_scene_prompt_audit.tidb.sql"), "utf8");
    expect(tidb).toContain("cabinet_dealz.door_style_room_scene_generations");
    expect(tidb).toContain("ADD COLUMN IF NOT EXISTS prompt TEXT NULL");
    expect(tidb).not.toContain("--> statement-breakpoint");
    const journal = readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8");
    expect(journal).toContain("0235_room_scene_prompt_audit");
  });
});

describe("generation carries the new prompt", () => {
  it("gives the model the recorded hex, not just the color word", async () => {
    const { applyDoorStyleRoomSceneGeneration } = await import("./doorStyleRoomSceneGeneration");
    const { DuplicateGenerationJobError } = await import("./doorStyleRoomSceneGeneration");
    let captured = "";
    let capturedUrls: Array<{ url: string }> = [];
    const store = {
      style: style({ color: "Blue", renderHex: "#3f4a5a", approvedVersionId: 5, approvedReferenceImageUrl: "https://cdn.example/approved.png", railWidth: "2.25" }),
      job: null as Record<string, unknown> | null,
      scenes: [] as Array<{ id: number; imageUrl: string; isVerified: boolean }>,
      async loadStyle() { return this.style; },
      async loadJob() { return this.job as never; },
      async insertJob(job: Record<string, unknown>) {
        if (this.job) throw new DuplicateGenerationJobError();
        this.job = { id: 1, ...job };
      },
      async updateJob(_id: number, patch: Record<string, unknown>) { this.job = { ...this.job, ...patch }; },
      async countScenes() { return 0; },
      async findAutoScene() { return null; },
      async insertScene() { const id = 1; this.scenes.push({ id, imageUrl: "x", isVerified: false }); return { id }; },
      async updateScene() {},
      async markSceneDraft() {},
      async clearPrimaryIfMatches() {},
    };
    const images = {
      configured: () => true,
      generate: async (input: { prompt: string; originalImages: Array<{ url: string }> }) => {
        captured = input.prompt;
        capturedUrls = input.originalImages;
        return { url: "https://cdn.example/scene.jpg" };
      },
    };
    const result = await applyDoorStyleRoomSceneGeneration(store as never, images as never, 7);
    expect(result.outcome).toBe("ready");
    expect(captured).toContain("#3f4a5a");
    expect(captured).toContain("approved door render");
    expect(captured).toContain("rail 2.25 inches");
    expect(capturedUrls.map((image) => image.url)).toEqual([
      "https://cdn.example/approved.png",
      "https://cdn.example/door.jpg",
      "https://cdn.example/drawer.jpg",
    ]);
    // The exact prompt is on the generation record.
    expect(store.job?.prompt).toBe(captured);
    vi.restoreAllMocks();
  });
});
