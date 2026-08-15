import { describe, expect, it, vi } from "vitest";
import { fetchTrpcJson, isHtmlApiFallback, isTrpcRequest } from "./trpcTransport";

describe("tRPC transport", () => {
  it("identifies tRPC paths and HTML fallback responses", () => {
    expect(isTrpcRequest("/api/trpc/pageContent.getAll?batch=1")).toBe(true);
    expect(isTrpcRequest("/catalog")).toBe(false);
    expect(isHtmlApiFallback(new Response("<!doctype html>", { headers: { "content-type": "text/html" } }))).toBe(true);
    expect(isHtmlApiFallback(new Response("{}", { headers: { "content-type": "application/json" } }))).toBe(false);
  });

  it("retries a transient HTML fallback once and retains credentials", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("<!doctype html>", { headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response("{\"result\":{}}", { headers: { "content-type": "application/json" } }));
    const wait = vi.fn().mockResolvedValue(undefined);

    const response = await fetchTrpcJson("/api/trpc/pageContent.getAll?batch=1", { headers: { "x-test": "1" } }, fetchImpl, wait);

    expect(wait).toHaveBeenCalledWith(350);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ credentials: "include", headers: { "x-test": "1" } });
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("does not retry an ordinary API JSON response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { headers: { "content-type": "application/json" } }));

    await fetchTrpcJson("/api/trpc/auth.me", undefined, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
