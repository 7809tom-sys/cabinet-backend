import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { youtubeNocookieEmbed } from "./affiliateResources";

describe("affiliate resource helpers", () => {
  it("builds a privacy-enhanced youtube embed and ignores placeholders", () => {
    expect(youtubeNocookieEmbed("https://www.youtube.com/watch?v=abcdefghijk")).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0",
    );
    expect(youtubeNocookieEmbed("https://youtu.be/abcdefghijk", 90)).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0&start=90",
    );
    expect(youtubeNocookieEmbed("https://www.youtube.com/watch?v=REPLACE_ME")).toBeNull();
    expect(youtubeNocookieEmbed(null)).toBeNull();
  });

  it("seeds only unpublished example drafts in migration 0218", () => {
    const sql = readFileSync(new URL("../drizzle/0218_affiliate_marketing_hub.sql", import.meta.url), "utf8");
    expect(sql).toContain("EXAMPLE DRAFT:");
    expect(sql).toContain("socialLinks");
    expect(sql).toContain("accessMarketing");
    expect(sql).not.toContain("youtube.com");
    expect(sql).not.toMatch(/\$\d/);
    expect(sql.match(/true, false\)/g)).toBeNull();
    const publishedFlags = sql.match(/, (true|false), (true|false)\)/g) ?? [];
    expect(publishedFlags.length).toBeGreaterThan(5);
    expect(publishedFlags.every((flag) => flag.startsWith(", false,"))).toBe(true);
  });
});
