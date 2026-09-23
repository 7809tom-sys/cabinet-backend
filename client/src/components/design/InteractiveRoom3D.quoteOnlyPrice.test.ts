import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/components/design/InteractiveRoom3D.tsx"), "utf8");

describe("3D itemized quote-only pricing", () => {
  it("labels quote-only lines as quote-required and unpriced cabinets as unavailable", () => {
    expect(source).toContain('line.unitPrice == null ? " · Quote required"');
    expect(source).toContain('line.lineTotal == null ? "Quote required"');
    expect(source).not.toContain('line.unitPrice == null ? " · Price pending"');
    expect(source).toContain('line?.lineTotal == null ? "Unavailable"');
    expect(source).not.toContain('line?.lineTotal == null ? "Price pending"');
  });
});
