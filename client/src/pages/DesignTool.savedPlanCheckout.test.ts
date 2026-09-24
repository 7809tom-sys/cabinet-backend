import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");
const cartContextSource = readFileSync(new URL("../contexts/CartContext.tsx", import.meta.url), "utf8");

describe("saved Design Tool checkout linkage", () => {
  it("replaces an empty or already synchronized cart with the exact saved plan payload", () => {
    expect(source).toContain("sourceDesignId: cartSourceDesignId");
    expect(source).toContain("currentSavedDesignId != null && (cartItems.length === 0 || cartSourceDesignId === currentSavedDesignId)");
    expect(source).toContain("replaceWithDesignItems(cartableLines, currentSavedDesignId)");
  });

  it("does not claim an unrelated mixed cart belongs to a saved plan", () => {
    expect(source).toContain("appending a plan to unrelated cart items deliberately drops that link");
    expect(cartContextSource).toContain("setSourceDesignId(null);");
  });
});
