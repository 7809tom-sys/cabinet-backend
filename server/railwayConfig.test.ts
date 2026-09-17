import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Railway deployment configuration", () => {
  it("uses the dedicated absolute health-check path exposed by the server", () => {
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
    expect(config.deploy?.healthcheckPath).toBe("/health");
    expect(config.deploy?.healthcheckPath).toMatch(/^\//);
    expect(config.deploy?.healthcheckTimeout).toBe(300);

    const serverSource = readFileSync(
      resolve(process.cwd(), "server/_core/index.ts"),
      "utf8",
    );
    expect(serverSource).toContain('app.get("/health"');
    expect(serverSource).toContain("res.status(200).json({ ok: true })");
  });
});
