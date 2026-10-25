import { describe, expect, it } from "vitest";
import {
  validateEmbedCode,
  embedCodeHasErrors,
  embedCodeHosts,
  EMBED_CODE_MAX_LENGTH,
} from "./embedCode";

const ELFSIGHT =
  '<script src="https://static.elfsight.com/platform/platform.js" async></script>\n<div class="elfsight-app-1234"></div>';

describe("validateEmbedCode", () => {
  it("accepts a normal widget snippet with no issues", () => {
    expect(validateEmbedCode(ELFSIGHT)).toEqual([]);
    expect(embedCodeHasErrors(ELFSIGHT)).toBe(false);
  });

  it("treats empty input as nothing to report", () => {
    expect(validateEmbedCode("")).toEqual([]);
    expect(validateEmbedCode(null)).toEqual([]);
    expect(validateEmbedCode(undefined)).toEqual([]);
  });

  it("rejects cookie access", () => {
    const issues = validateEmbedCode('<script>document.cookie="x=1"</script>');
    expect(issues.some((i) => i.severity === "error" && /cookie/i.test(i.message))).toBe(true);
    expect(embedCodeHasErrors('<script>document.cookie="x=1"</script>')).toBe(true);
  });

  it("rejects browser storage access", () => {
    expect(embedCodeHasErrors('<script>localStorage.getItem("t")</script>')).toBe(true);
    expect(embedCodeHasErrors('<script>sessionStorage.clear()</script>')).toBe(true);
  });

  it("rejects document.write", () => {
    expect(embedCodeHasErrors("<script>document.write('hi')</script>")).toBe(true);
  });

  it("rejects parent-page redirects", () => {
    expect(embedCodeHasErrors("<script>window.top.location='http://evil.test'</script>")).toBe(true);
  });

  it("rejects snippets that harvest payment or password fields", () => {
    expect(embedCodeHasErrors('<form action="/x"><input name="credit_card" /></form>')).toBe(true);
  });

  it("rejects snippets over the length cap", () => {
    const long = "<div>" + "a".repeat(EMBED_CODE_MAX_LENGTH + 10) + "</div>";
    expect(embedCodeHasErrors(long)).toBe(true);
  });

  it("warns (not errors) when only a bare URL was pasted", () => {
    const issues = validateEmbedCode("https://elfsight.com/widget/abc");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
    expect(embedCodeHasErrors("https://elfsight.com/widget/abc")).toBe(false);
  });

  it("warns when a full HTML document was pasted", () => {
    const issues = validateEmbedCode("<html><body><div>widget</div></body></html>");
    expect(issues.some((i) => i.severity === "warning" && /full html/i.test(i.message))).toBe(true);
  });

  it("warns when the snippet has no tags at all", () => {
    const issues = validateEmbedCode("just some text");
    expect(issues.some((i) => i.severity === "warning")).toBe(true);
  });
});

describe("embedCodeHosts", () => {
  it("lists the third-party hosts a snippet contacts", () => {
    expect(embedCodeHosts(ELFSIGHT)).toEqual(["static.elfsight.com"]);
  });

  it("deduplicates and sorts hosts", () => {
    const code =
      '<script src="https://b.example.com/a.js"></script><script src="https://a.example.com/b.js"></script><img src="https://b.example.com/p.gif">';
    expect(embedCodeHosts(code)).toEqual(["a.example.com", "b.example.com"]);
  });

  it("returns nothing for a snippet with no external URLs", () => {
    expect(embedCodeHosts("<div>local only</div>")).toEqual([]);
  });
});
