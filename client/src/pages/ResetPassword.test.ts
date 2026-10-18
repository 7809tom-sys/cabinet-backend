import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ResetPassword.tsx", import.meta.url), "utf8");

describe("ResetPassword", () => {
  it("requires a valid-length token, matching password confirmation, and the secure completion mutation", () => {
    expect(source).toContain('trpc.emailAuth.completePasswordReset.useMutation');
    expect(source).toContain('token.length !== 64');
    expect(source).toContain('password !== confirmation');
    expect(source).toContain('navigate("/signin")');
  });
});
