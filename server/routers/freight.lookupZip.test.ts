import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { TrpcContext } from "../_core/context";
import { freightRouter } from "./freight";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("freight.lookupZip", () => {
  const caller = freightRouter.createCaller(publicCtx());

  it("returns city and state for a known ZIP with no signed-in user", async () => {
    await expect(caller.lookupZip({ zip: "10001" })).resolves.toEqual({ city: "New York", state: "NY" });
  });

  it("uses the first five digits of ZIP+4", async () => {
    await expect(caller.lookupZip({ zip: "10001-1234" })).resolves.toEqual({ city: "New York", state: "NY" });
    await expect(caller.lookupZip({ zip: " 90210-0000 " })).resolves.toEqual({ city: "Beverly Hills", state: "CA" });
  });

  it("returns null when the ZIP is unknown", async () => {
    await expect(caller.lookupZip({ zip: "99999" })).resolves.toBeNull();
  });

  it("returns null for bad input", async () => {
    await expect(caller.lookupZip({ zip: "" })).resolves.toBeNull();
    await expect(caller.lookupZip({ zip: "1234" })).resolves.toBeNull();
    await expect(caller.lookupZip({ zip: "nope" })).resolves.toBeNull();
    await expect(caller.lookupZip({ zip: "ABCDE" })).resolves.toBeNull();
  });

  it("keeps the ZIP table off the client bundle", () => {
    const clientRoot = resolve(process.cwd(), "client");
    const offenders = sourceFiles(clientRoot).filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("usZipLocalities") || source.includes("freightCarrierAddress");
    });
    expect(offenders).toEqual([]);
  });
});
