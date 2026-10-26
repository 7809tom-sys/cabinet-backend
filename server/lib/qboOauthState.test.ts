import { describe, expect, it } from "vitest";
import { consumeQboOauthState, issueQboOauthState, resetQboOauthStateForTests } from "./qboOauthState";

describe("QuickBooks OAuth state", () => {
  it("accepts the state only once when the cookie matches the admin who started it", () => {
    resetQboOauthStateForTests();
    const state = issueQboOauthState(15, 1_000);
    expect(consumeQboOauthState(state, "other-cookie", 1_000)).toBeNull();
    expect(consumeQboOauthState(state, state, 1_000)).toEqual({ userId: 15 });
    expect(consumeQboOauthState(state, state, 1_000)).toBeNull();
  });

  it("rejects an expired state", () => {
    resetQboOauthStateForTests();
    const state = issueQboOauthState(15, 1_000);
    expect(consumeQboOauthState(state, state, 1_000 + 10 * 60 * 1000)).toBeNull();
  });
});
