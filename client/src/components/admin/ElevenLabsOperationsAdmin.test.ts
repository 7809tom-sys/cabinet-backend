import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const panelSource = readFileSync(resolve(process.cwd(), "client/src/components/admin/ElevenLabsOperationsAdmin.tsx"), "utf8");
const routerSource = readFileSync(resolve(process.cwd(), "server/routers/operationsProviders.ts"), "utf8");
const providerSource = readFileSync(resolve(process.cwd(), "server/lib/elevenLabsProvider.ts"), "utf8");

describe("ElevenLabs Operations panel", () => {
  it("keeps the connection check administrator-only and exposes no credential input", () => {
    expect(routerSource).toContain("adminProcedure");
    expect(routerSource).toContain("getElevenLabsStatus");
    expect(routerSource).toContain("testElevenLabsConnection");
    expect(panelSource).toContain("Test connection");
    expect(panelSource).not.toContain('type="password"');
    expect(panelSource).toContain("credential is never shown");
  });

  it("uses only the documented server-side user endpoint and does not position audio as image generation", () => {
    expect(providerSource).toContain("https://api.elevenlabs.io/v1/user");
    expect(providerSource).toContain('"xi-api-key"');
    expect(routerSource).toContain("imageGenerationSupported: false");
    expect(panelSource).toContain("not</strong> a customer kitchen-image generation provider");
  });
});
