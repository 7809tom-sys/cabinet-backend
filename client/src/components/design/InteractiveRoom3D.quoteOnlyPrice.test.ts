import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/components/design/InteractiveRoom3D.tsx"), "utf8");

describe("3D itemized quote-only pricing", () => {
  it("labels every line without a resolved authorized price as quote-required", () => {
    expect(source).toContain('line.unitPrice == null ? " · Quote required"');
    expect(source).toContain('line.lineTotal == null ? "Quote required"');
    expect(source).not.toContain('line.unitPrice == null ? " · Price pending"');
  });
});
