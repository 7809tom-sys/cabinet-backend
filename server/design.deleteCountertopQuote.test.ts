import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function section(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start < 0) return "";
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end < 0 ? source.slice(start) : source.slice(start, end);
}

describe("admin delete for countertop quote requests", () => {
  it("exposes the delete as an admin-only mutation", () => {
    const router = read("server/routers/design.ts");
    const block = section(router, "deleteCountertopQuote: protectedProcedure", "updateCountertopQuote: protectedProcedure");
    expect(block.length).toBeGreaterThan(200);
    expect(block).toContain('ctx.user.role !== "admin"');
    expect(block).toContain("FORBIDDEN");
  });

  it("re-derives junk safety on the server before deleting", () => {
    const router = read("server/routers/design.ts");
    const block = section(router, "deleteCountertopQuote: protectedProcedure", "updateCountertopQuote: protectedProcedure");
    // The browser's canDelete flag is never trusted on its own.
    expect(block).toContain("getCountertopQuoteJunkReason(row) === null");
    expect(block).toContain("countertopScopeCondition(hostScope)");
    expect(block).toContain("NOT_FOUND");
    expect(block).toContain(".delete(countertopQuotes)");
    // The address and the quote age are part of the junk rule, so the guard must load them.
    expect(block).toContain("jobSiteAddress: countertopQuotes.jobSiteAddress");
    expect(block).toContain("createdAt: countertopQuotes.createdAt");
  });

  it("marks which rows the admin may delete, and why, from the server", () => {
    const router = read("server/routers/design.ts");
    const list = section(router, "listCountertopQuotes: protectedProcedure.query", "deleteCountertopQuote:");
    expect(list).toContain("getCountertopQuoteJunkReason(row)");
    expect(list).toContain("canDelete: junkReason !== null");
  });

  it("renders the button and the reason only for rows the server flagged", () => {
    const ui = read("client/src/components/admin/AdminGroupedTabs.tsx");
    expect(ui).toContain("trpc.design.deleteCountertopQuote.useMutation");
    expect(ui).toContain("{q.canDelete && (");
    expect(ui).toContain("countertopQuoteJunkLabel(q.junkReason)");
    expect(ui).toContain("window.confirm(");
  });
});
