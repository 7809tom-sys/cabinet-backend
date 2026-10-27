import { describe, expect, it } from "vitest";
import { isOwnerEmail, shouldPromoteOwnerToAdmin } from "./ownerAdmin";

describe("owner admin promotion", () => {
  it("promotes only a non-admin row whose email is the configured owner", () => {
    expect(
      shouldPromoteOwnerToAdmin("user", "Owner@Yahoo.com", "owner@yahoo.com")
    ).toBe(true);
    expect(
      shouldPromoteOwnerToAdmin(
        "distributor",
        " owner@yahoo.com ",
        "owner@yahoo.com"
      )
    ).toBe(true);
    expect(
      shouldPromoteOwnerToAdmin("admin", "owner@yahoo.com", "owner@yahoo.com")
    ).toBe(false);
    expect(
      shouldPromoteOwnerToAdmin(
        "user",
        "affiliate@yahoo.com",
        "owner@yahoo.com"
      )
    ).toBe(false);
    expect(shouldPromoteOwnerToAdmin("user", "owner@yahoo.com", "  ")).toBe(
      false
    );
    expect(isOwnerEmail("owner@yahoo.com", "owner@yahoo.com")).toBe(true);
  });
});
