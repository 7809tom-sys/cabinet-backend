import { describe, it, expect } from "vitest";
import { buildTawkEmbedUrl, isTawkConfigured, normalizeWidgetId } from "./tawk";

describe("tawk helpers", () => {
  it("treats missing/blank property id as not configured", () => {
    expect(isTawkConfigured(undefined)).toBe(false);
    expect(isTawkConfigured("")).toBe(false);
    expect(isTawkConfigured("   ")).toBe(false);
    expect(isTawkConfigured("5f1a2b3c")).toBe(true);
  });

  it("defaults a blank widget id to 'default'", () => {
    expect(normalizeWidgetId(undefined)).toBe("default");
    expect(normalizeWidgetId("")).toBe("default");
    expect(normalizeWidgetId("1abc")).toBe("1abc");
  });

  it("returns null embed url when unconfigured", () => {
    expect(buildTawkEmbedUrl(undefined, undefined)).toBeNull();
    expect(buildTawkEmbedUrl("", "default")).toBeNull();
  });

  it("builds the correct embed url when configured", () => {
    expect(buildTawkEmbedUrl("5f1a2b3c", "1abc")).toBe(
      "https://embed.tawk.to/5f1a2b3c/1abc",
    );
    expect(buildTawkEmbedUrl(" 5f1a2b3c ", "")).toBe(
      "https://embed.tawk.to/5f1a2b3c/default",
    );
  });
});
