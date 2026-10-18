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

  it("retries the new session and refuses to enter a requested Designer route as anonymous", () => {
    expect(source).toContain("await new Promise((resolve) => window.setTimeout(resolve, 150))");
    expect(source).toContain("if (!me) {");
    expect(source).toContain("Your sign-in session could not be confirmed. Please try again.");
    expect(source).toContain("const destination = isSafeSiteReturnPath(requestedReturn)");
  });
});
