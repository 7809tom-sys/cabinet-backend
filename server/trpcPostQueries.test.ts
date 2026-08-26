import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../client/src/main.tsx", import.meta.url), "utf8");

describe("large tRPC designer queries", () => {
  it("sends query batches by POST and allows POST queries at the Express adapter", () => {
    expect(clientSource).toContain("methodOverride: TRPC_QUERY_METHOD_OVERRIDE");
    expect(serverSource).toContain("allowMethodOverride: true");
  });
});
