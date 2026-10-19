import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Designer visual faucet selection", () => {
  it("requests the complete bounded measured-faucet palette instead of six suggestions", () => {
    expect(source).toContain('{ role: bathroomSinkDialog ? "vanity-faucet" : "faucet", limit: 200 }');
  });

  it("delegates every verified kitchen or vanity faucet to the reusable visual picker without a local six-card slice", () => {
    expect(source).toContain("<PelicanFaucetPicker");
    expect(source).toContain("faucets={filteredFaucets}");
    expect(source).not.toContain("filteredFaucets.slice(0, 6)");
  });

  it("keeps the chosen exact faucet identity and measured profile in the attached sink fixture and selected surfaces", () => {
    expect(source).toContain("pelicanFaucetProductId: faucetProduct?.id");
    expect(source).toContain("pelicanFaucetProductName: faucetProduct?.name");
    expect(source).toContain("pelicanFaucetProductImage: faucetProduct?.imageUrl");
    expect(source).toContain("pelicanFaucetProfileId: verifiedFaucetProfile?.id");
    expect(source).toContain('"faucet"');
  });
});
