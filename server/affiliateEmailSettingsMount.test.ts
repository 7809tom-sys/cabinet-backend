/**
 * The contract aliases must be reachable from the real root router, because
 * that is what the frontend's `trpc.affiliateEmailSettings.*` calls resolve
 * against. A sub-router that exists but is never mounted would pass the
 * behaviour tests and still fail in production.
 *
 * Safety: no database or network. The root router is only inspected.
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

function procedureNames(node: unknown, prefix = ""): string[] {
  const record = node as { _def?: { procedures?: Record<string, unknown>; record?: Record<string, unknown> } };
  const def = record?._def;
  const children = def?.procedures ?? def?.record;
  if (!children) return [];
  const names: string[] = [];
  for (const [key, value] of Object.entries(children)) {
    const nested = procedureNames(value, `${prefix}${key}.`);
    if (nested.length === 0) names.push(`${prefix}${key}`);
    else names.push(...nested);
  }
  return names;
}

describe("affiliateEmailSettings contract is mounted", () => {
  const names = procedureNames(appRouter);

  it("exposes get, update, and sendTest at the top level", () => {
    expect(names).toContain("affiliateEmailSettings.get");
    expect(names).toContain("affiliateEmailSettings.update");
    expect(names).toContain("affiliateEmailSettings.sendTest");
  });

  it("keeps the native CRM surface mounted alongside it", () => {
    expect(names).toContain("crm.emailSetup.get");
    expect(names).toContain("crm.emailSetup.save");
    expect(names).toContain("crm.emailSetup.sendTest");
  });

  it("does not leak a slug-addressed variant the server would have to trust", () => {
    const emailProcedures = names.filter((name) => name.startsWith("affiliateEmailSettings."));
    expect(emailProcedures.sort()).toEqual([
      "affiliateEmailSettings.get",
      "affiliateEmailSettings.sendTest",
      "affiliateEmailSettings.update",
    ]);
  });
});
