import { describe, it, expect } from "vitest";
import { resolveApexRedirect } from "./apexRedirect";

describe("resolveApexRedirect", () => {
  it("redirects the naked apex to www, preserving path + query", () => {
    expect(resolveApexRedirect("cabinetdealz.com", "/")).toBe(
      "https://www.cabinetdealz.com/"
    );
    expect(
      resolveApexRedirect("cabinetdealz.com", "/styles?door=Double%20Shaker")
    ).toBe("https://www.cabinetdealz.com/styles?door=Double%20Shaker");
  });

  it("strips a port from the host header", () => {
    expect(resolveApexRedirect("cabinetdealz.com:8080", "/cart")).toBe(
      "https://www.cabinetdealz.com/cart"
    );
  });

  it("is case-insensitive on the host", () => {
    expect(resolveApexRedirect("CabinetDealz.COM", "/account")).toBe(
      "https://www.cabinetdealz.com/account"
    );
  });

  it("does NOT redirect the www host (already correct)", () => {
    expect(resolveApexRedirect("www.cabinetdealz.com", "/")).toBeNull();
  });

  it("does NOT redirect local dev or Manus hosts", () => {
    expect(resolveApexRedirect("localhost", "/")).toBeNull();
    expect(resolveApexRedirect("127.0.0.1:3000", "/")).toBeNull();
    expect(
      resolveApexRedirect("cabinetz-dq7pucbp.manus.space", "/")
    ).toBeNull();
    expect(
      resolveApexRedirect("3000-abc.us2.manus.computer", "/")
    ).toBeNull();
  });

  it("does NOT redirect unrelated hosts or empty host", () => {
    expect(resolveApexRedirect("example.com", "/")).toBeNull();
    expect(resolveApexRedirect(undefined, "/")).toBeNull();
    expect(resolveApexRedirect("", "/")).toBeNull();
  });

  it("falls back to '/' when originalUrl is malformed", () => {
    expect(resolveApexRedirect("cabinetdealz.com", "")).toBe(
      "https://www.cabinetdealz.com/"
    );
  });
});
