import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./InteractiveRoom3D.tsx", import.meta.url), "utf8");
const statusExpression = source.match(/const geminiImageTestBlockingReason = ([\s\S]*?);\n/)?.[1];
function status(overrides: Record<string, unknown> = {}) {
  const state = {
    geminiManifestValidationReason: null,
    geminiImageTestJobId: null,
    geminiAutomaticRetrySeconds: 0,
    geminiAutomaticRetryLabel: "0s",
    startGeminiImageTestMutation: { isPending: false },
    photoRenderDraft: {},
    geminiCooldownActive: false,
    geminiCooldownLabel: "0s",
    ...overrides,
  };
  if (!statusExpression) throw new Error("Gemini status expression missing");
  return Function(...Object.keys(state), `return (${statusExpression});`)(...Object.values(state));
}
const button = source.match(/<Button[^>]*onClick=\{\(\) => void startGeminiImageTest\(\)\}[\s\S]*?<\/Button>/)?.[0];
const disabledExpression = button?.match(/disabled=\{([^}]+)\}/)?.[1];
function disabled(overrides: Record<string, unknown> = {}) {
  const state = {
    startGeminiImageTestMutation: { isPending: false },
    geminiCooldownActive: false,
    geminiManifestValidationReason: null,
    ...overrides,
  };
  if (!disabledExpression) throw new Error("Gemini button disabled expression missing");
  return Function(...Object.keys(state), `return (${disabledExpression});`)(...Object.values(state));
}

describe("Gemini image button workflow", () => {
  it("shows the exact material blocker instead of pretending Google is generating", () => {
    const reason = "Google image test blocked: Missing exact swatch: countertop";
    expect(status({ geminiManifestValidationReason: reason })).toBe(reason);
    expect(status({ geminiManifestValidationReason: reason, geminiImageTestJobId: 42 })).toBe(reason);
  });
  it("does not claim an idle preview is generating", () => {
    expect(status()).toBeNull();
    expect(status({ photoRenderDraft: null })).toContain("Open Final preview");
  });
  it("reports real pending requests, active jobs and rate limits", () => {
    expect(status({ startGeminiImageTestMutation: { isPending: true } })).toContain("Starting");
    expect(status({ geminiImageTestJobId: 42 })).toContain("Google is generating");
    expect(status({ geminiImageTestJobId: 42, geminiAutomaticRetrySeconds: 60, geminiAutomaticRetryLabel: "1m 00s" })).toContain("automatically in 1m 00s");
    expect(status({ geminiCooldownActive: true })).toContain("rate-limited");
  });
  it("lets a click explain missing references while preventing duplicate requests and rate-limit bypass", () => {
    expect(disabled()).toBe(false);
    expect(disabled({ geminiManifestValidationReason: "Missing swatch" })).toBe(false);
    expect(disabled({ startGeminiImageTestMutation: { isPending: true } })).toBe(true);
    expect(disabled({ geminiCooldownActive: true })).toBe(true);
    const handler = source.slice(source.indexOf("const startGeminiImageTest = async () =>"), source.indexOf("const openSavedGeminiImageTest ="));
    expect(handler).toMatch(/if \(geminiManifestValidationReason\) \{\s*setGeminiImageTestError\(geminiManifestValidationReason\);\s*return;/);
    expect(handler.indexOf("if (geminiManifestValidationReason)")).toBeLessThan(handler.indexOf("mutateAsync("));
  });
  it("keeps the in-house WebGL path tracer disabled", () => {
    expect(source).toContain("export const IN_HOUSE_PATH_TRACE_ENABLED = false;");
    expect(source).toContain("if (!isPhotoQualityTest || !IN_HOUSE_PATH_TRACE_ENABLED) return;");
  });
});
