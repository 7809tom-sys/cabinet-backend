import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Railway deployment configuration", () => {
  it("uses a valid absolute root health-check path", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "railway.json"), "utf8"),
    ) as {
      $schema?: string;
      deploy?: {
        healthcheckPath?: string;
        healthcheckTimeout?: number;
      };
    };

    expect(config.$schema).toBe("https://railway.com/railway.schema.json");
    expect(config.deploy?.healthcheckPath).toBe("/");
    expect(config.deploy?.healthcheckPath).toMatch(/^\//);
    expect(config.deploy?.healthcheckTimeout).toBe(300);
  });
});
