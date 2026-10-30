import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateRequest } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
}));
vi.mock("./sdk", () => ({ sdk: { authenticateRequest } }));

import { createContext } from "./context";

describe("createContext token mapping", () => {
  beforeEach(() => {
    authenticateRequest.mockReset();
  });

  it("keeps the mapped user when authentication succeeds", async () => {
    const user = { id: 4, role: "admin", email: "second-admin@shop.test" };
    authenticateRequest.mockResolvedValue(user);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = await createContext({ req: { headers: {} }, res: {} } as never);
    expect(ctx.user).toBe(user);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs the error and leaves user null when token mapping throws", async () => {
    authenticateRequest.mockRejectedValue(new Error("Invalid Supabase token"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = await createContext({ req: { headers: {} }, res: {} } as never);
    expect(ctx.user).toBeNull();
    expect(spy).toHaveBeenCalledWith(
      "[Auth] token mapping failed",
      "Invalid Supabase token"
    );
    spy.mockRestore();
  });
});
