import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeLLM = vi.hoisted(() => vi.fn());
vi.mock("../_core/llm", () => ({ invokeLLM }));
vi.mock("../storage", () => ({ storageFetchObject: vi.fn() }));

import { DOOR_RENDER_AUDIT_MODEL, decodeRenderUpload, parseDoorRenderScoreText, scoreDoorRenderPair } from "./doorRenderingAuditScore";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe("door render upload", () => {
  it("accepts a PNG render and rejects a file that is not an image", () => {
    const decoded = decodeRenderUpload(png.toString("base64"), "image/png");
    expect(decoded.contentType).toBe("image/png");
    expect(decoded.extension).toBe("png");
    expect(decoded.bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(() => decodeRenderUpload(Buffer.from("hello world").toString("base64"), "image/png")).toThrow(/PNG, JPEG, or WebP/);
  });
});

describe("door render scoring", () => {
  beforeEach(() => {
    invokeLLM.mockReset();
  });

  it("clamps vision scores onto the 1 to 10 scale", () => {
    expect(parseDoorRenderScoreText(JSON.stringify({
      woodGrain: 0,
      color: "11.6",
      textureSheen: 7.2,
      profileEdges: 4,
      overall: 8,
      notes: "  Grain is too strong.  ",
    }))).toEqual({
      scores: { woodGrain: 1, color: 10, textureSheen: 7, profileEdges: 4, overall: 8 },
      notes: "Grain is too strong.",
    });
  });

  it("asks Gemini to compare the sample photo with the render and returns the scores", async () => {
    invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            woodGrain: 6,
            color: 8,
            textureSheen: 7,
            profileEdges: 5,
            overall: 7,
            notes: "The rail edges are softer than the sample.",
          }),
        },
      }],
    });
    const sample = "data:image/jpeg;base64,c2FtcGxl";
    const render = "data:image/png;base64,cmVuZGVy";
    const scored = await scoreDoorRenderPair({ sampleImage: sample, renderImage: render });
    expect(scored.model).toBe(DOOR_RENDER_AUDIT_MODEL);
    expect(scored.scores).toEqual({ woodGrain: 6, color: 8, textureSheen: 7, profileEdges: 5, overall: 7 });
    expect(scored.notes).toContain("rail edges");
    const request = invokeLLM.mock.calls[0][0];
    expect(request.model).toBe(DOOR_RENDER_AUDIT_MODEL);
    expect(request.responseFormat.json_schema.name).toBe("door_render_audit_scores");
    const parts = request.messages[1].content;
    const images = parts.filter((part: { type?: string }) => part.type === "image_url");
    expect(images.map((part: { image_url: { url: string } }) => part.image_url.url)).toEqual([sample, render]);
    expect(parts.map((part: { text?: string }) => part.text).join(" ")).toContain("Image 1 is the real sample door photo.");
  });
});
