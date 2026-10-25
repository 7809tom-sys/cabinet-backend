import { afterEach, describe, expect, it, vi } from "vitest";
import { exactPlanPrompt } from "./routers/designPhotoRenders";

describe("Gemini exact-plan test: plan only, database material samples", () => {
  it("forbids adding cabinets and tells Google to use the countertop and backsplash samples", () => {
    const prompt = exactPlanPrompt("Saved design #1");
    expect(prompt).toMatch(/FOLLOW THE KITCHEN PLAN ONLY/);
    expect(prompt).toMatch(/Do not add a cabinet, a cabinet run, an island/);
    expect(prompt).toMatch(/Empty wall space in image 1 must stay empty/);
    expect(prompt).toMatch(/countertop sample picture and the backsplash sample picture/);
    expect(prompt).toMatch(/Light staging is allowed/);
  });
});

describe("generateGeminiExactPlanTest request", () => {
  afterEach(() => vi.restoreAllMocks());
  it("sends the plan first, then each material sample labelled as a sample only", async () => {
    vi.resetModules();
    vi.doMock("./_core/env", () => ({ ENV: { geminiApiKey: "k" } }));
    const bodies: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from("x").toString("base64") } }] } }] }), { status: 200 });
    }));
    const mod = await import("./lib/geminiImageProvider");
    await mod.generateGeminiExactPlanTest({
      prompt: "p",
      sourceImageBase64: "AAAA",
      sourceMimeType: "image/jpeg",
      references: [
        { label: "countertop — Quartz", mimeType: "image/jpeg", base64: "BBBB" },
        { label: "backsplash — Tile", mimeType: "image/jpeg", base64: "CCCC" },
      ],
    }).catch(() => undefined);
    const parts = bodies[0].contents[0].parts;
    const inline = parts.filter((p: any) => p.inlineData).map((p: any) => p.inlineData.data);
    expect(inline).toEqual(["AAAA", "BBBB", "CCCC"]);
    const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join("\n");
    expect(text).toMatch(/IMAGE 2 — MATERIAL SAMPLE ONLY: countertop — Quartz/);
    expect(text).toMatch(/IMAGE 3 — MATERIAL SAMPLE ONLY: backsplash — Tile/);
  });
});
