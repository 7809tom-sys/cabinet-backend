import { afterEach, describe, expect, it } from "vitest";
import { logDesignView } from "./routers/design";

// A db handle that fails the test if it is touched at all.
const untouchableDb = new Proxy({}, {
  get() { throw new Error("db must not be used when CD_SKIP_VIEW_LOG=1"); },
}) as never;

describe("design view log opt-out", () => {
  const prev = process.env.CD_SKIP_VIEW_LOG;
  afterEach(() => {
    if (prev === undefined) delete process.env.CD_SKIP_VIEW_LOG; else process.env.CD_SKIP_VIEW_LOG = prev;
  });

  it("writes nothing and never touches the database when CD_SKIP_VIEW_LOG=1", async () => {
    process.env.CD_SKIP_VIEW_LOG = "1";
    await expect(logDesignView(untouchableDb, { designId: 1, userId: 1, kind: "owner" })).resolves.toBeUndefined();
  });
});
