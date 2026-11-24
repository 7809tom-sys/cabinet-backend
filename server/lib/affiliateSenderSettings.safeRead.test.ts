import { describe, expect, it, vi } from "vitest";
import { loadSenderRowSafe } from "./affiliateSenderSettings";

describe("loadSenderRowSafe", () => {
  it("logs the real database error and reports unavailable instead of throwing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => { throw new Error("Failed query: select ... contactEmail ..."); } }) }) }),
    };
    const result = await loadSenderRowSafe(failing as never, 1);
    expect(result).toEqual({ row: null, unavailable: true });
    expect(String(spy.mock.calls[0]?.[0])).toContain("Failed query");
    expect(String(spy.mock.calls[0]?.[0])).toContain("0231");
    spy.mockRestore();
  });

  it("returns the row when the read works", async () => {
    const ok = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 7 }] }) }) }) };
    expect(await loadSenderRowSafe(ok as never, 1)).toEqual({ row: { id: 7 }, unavailable: false });
  });
});
