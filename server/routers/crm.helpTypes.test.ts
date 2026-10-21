import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relative: string) => readFileSync(resolve(process.cwd(), relative), "utf8");

const schema = source("drizzle/schema.ts");
const router = source("server/routers/crm.ts");

describe("CRM help type persistence", () => {
  it("keeps closing help and adds independent design and shipping-cost help flags", () => {
    expect(schema).toContain('needsHelpClosing: boolean("needsHelpClosing").default(false).notNull()');
    expect(schema).toContain('needsHelpDesigning: boolean("needsHelpDesigning").default(false).notNull()');
    expect(schema).toContain('needsHelpShipping: boolean("needsHelpShipping").default(false).notNull()');
  });

  it("accepts and persists each help type independently through the scoped CRM update route", () => {
    expect(router).toContain("needsHelpClosing: z.boolean().optional()");
    expect(router).toContain("needsHelpDesigning: z.boolean().optional()");
    expect(router).toContain("needsHelpShipping: z.boolean().optional()");
    expect(router).toContain("patch.needsHelpClosing = input.needsHelpClosing");
    expect(router).toContain("patch.needsHelpDesigning = input.needsHelpDesigning");
    expect(router).toContain("patch.needsHelpShipping = input.needsHelpShipping");
  });

  it("only plans the matching internal team alert when design or shipping help changes from off to on", () => {
    expect(router).toContain("newlyRequestedCrmHelpKinds(deal, input)");
    expect(router).toContain("notifyCrmHelpTeam(db, deal, kind)");
    expect(router).toContain("recipientsForCrmHelpNotification(settings, kind)");
    expect(router).toContain("sendEmailViaSettings");
  });
});
