import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./SignIn.tsx", import.meta.url), "utf8");

describe("SignIn password access", () => {
  it("gives the person signing in a visible Show/Hide control and a reset-link request action", () => {
    expect(source).toContain('aria-label={showLoginPw ? "Hide password" : "Show password"}');
    expect(source).toContain('>Show</>');
    expect(source).toContain('>Hide</>');
    expect(source).toContain('trpc.emailAuth.requestPasswordReset.useMutation');
    expect(source).toContain("Email password-reset link");
  });

  it("reloads the same-host destination after email sign-in so the mounted Designer header reads the new session", () => {
    expect(source).toContain("const destination =");
    expect(source).toContain("window.location.assign(destination)");
    expect(source).toContain("await utils.auth.me.fetch()");
  });
});
