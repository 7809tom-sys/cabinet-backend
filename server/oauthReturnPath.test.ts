import { describe, expect, it } from "vitest";
import { resolveOAuthReturnPath } from "./oauthReturnPath";

function state(payload: unknown) {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

describe("OAuth post-login return path", () => {
  it("returns an affiliate storefront visitor to the exact store path after sign-in", () => {
    expect(resolveOAuthReturnPath(state({
      redirectUri: "https://www.cabinetdealz.com/api/oauth/callback",
      returnTo: "/store/reaves-way-cabinet-shop",
    }))).toBe("/store/reaves-way-cabinet-shop");
  });

  it("preserves an allowed affiliate storefront query string", () => {
    expect(resolveOAuthReturnPath(state({ returnTo: "/store/reaves-way-cabinet-shop?ref=REAVES" })))
      .toBe("/store/reaves-way-cabinet-shop?ref=REAVES");
  });

  it("rejects absolute, protocol-relative, and OAuth callback return targets", () => {
    expect(resolveOAuthReturnPath(state({ returnTo: "https://outside.example" }))).toBe("/");
    expect(resolveOAuthReturnPath(state({ returnTo: "//outside.example" }))).toBe("/");
    expect(resolveOAuthReturnPath(state({ returnTo: "/api/oauth/callback" }))).toBe("/");
  });

  it("keeps legacy callback-only state compatible by returning home", () => {
    expect(resolveOAuthReturnPath(Buffer.from("https://www.cabinetdealz.com/api/oauth/callback").toString("base64"))).toBe("/");
  });
});
