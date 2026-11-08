import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { publicErrorCause } from "./trpc";

/**
 * The cap tells the client *why* it was refused with a stable code. The tRPC
 * error formatter copies a deliberate all-caps cause onto error.data.cause, and
 * copies nothing else: an internal cause must never be widened into the public
 * error payload.
 */
describe("tRPC public error cause", () => {
  it("passes MEMBERSHIP_REQUIRED through, as the free-use refusal sends it", () => {
    const error = new TRPCError({
      code: "FORBIDDEN",
      message: "Buy the affiliate membership.",
      cause: new Error("MEMBERSHIP_REQUIRED"),
    });
    expect(publicErrorCause(error)).toBe("MEMBERSHIP_REQUIRED");
  });

  it("publishes nothing for an ordinary internal failure", () => {
    expect(
      publicErrorCause(
        new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "boom" })
      )
    ).toBeUndefined();
    // A driver message or a URL never becomes a public reason code.
    expect(
      publicErrorCause(
        new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          cause: new Error("Unknown column 'membershipStatus' in 'field list'"),
        })
      )
    ).toBeUndefined();
    expect(
      publicErrorCause(
        new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          cause: new Error("https://internal.example/secret"),
        })
      )
    ).toBeUndefined();
    expect(publicErrorCause({})).toBeUndefined();
  });

  it("only accepts the all-caps code shape, not arbitrary text", () => {
    expect(
      publicErrorCause({ cause: { message: "lowercase" } })
    ).toBeUndefined();
    expect(
      publicErrorCause({ cause: { message: "Mixed_Case" } })
    ).toBeUndefined();
    expect(
      publicErrorCause({ cause: { message: "HAS A SPACE" } })
    ).toBeUndefined();
    expect(
      publicErrorCause({ cause: { message: "A".repeat(65) } })
    ).toBeUndefined();
    expect(
      publicErrorCause({ cause: { message: "MEMBERSHIP_REQUIRED_2" } })
    ).toBe("MEMBERSHIP_REQUIRED_2");
  });
});
