import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relative: string) => readFileSync(resolve(process.cwd(), relative), "utf8");
const schema = source("drizzle/schema.ts");
const router = source("server/routers/emailSettings.ts");

describe("CRM help notification settings API", () => {
  it("persists separate default-off team switches and recipient lists", () => {
    expect(schema).toContain('onCrmDesignHelp: varchar("onCrmDesignHelp", { length: 1024 }).default("").notNull()');
    expect(schema).toContain('onCrmShippingHelp: varchar("onCrmShippingHelp", { length: 1024 }).default("").notNull()');
    expect(schema).toContain('notifyOnCrmDesignHelp: boolean("notifyOnCrmDesignHelp").default(false).notNull()');
    expect(schema).toContain('notifyOnCrmShippingHelp: boolean("notifyOnCrmShippingHelp").default(false).notNull()');
  });

  it("keeps the settings route admin-only while validating all four CRM help notification fields", () => {
    expect(router).toContain("onCrmDesignHelp: z.string().max(1024)");
    expect(router).toContain("onCrmShippingHelp: z.string().max(1024)");
    expect(router).toContain("notifyOnCrmDesignHelp: z.boolean()");
    expect(router).toContain("notifyOnCrmShippingHelp: z.boolean()");
    expect(router).toContain("await adminOnly(ctx.user.role)");
  });
});
