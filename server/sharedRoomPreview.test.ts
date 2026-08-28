import { describe, expect, it } from "vitest";
import { sharedRoomTokenFromPath } from "./sharedRoomPreview";

describe("shared room preview routing", () => {
  const token = "aBcD1234_efGhI56";

  it("extracts only an unguessable token from the public shared-room route", () => {
    expect(sharedRoomTokenFromPath(`/3d/${token}`)).toBe(token);
    expect(sharedRoomTokenFromPath(`/3d/${token}?view=v1.example`)).toBe(token);
    expect(sharedRoomTokenFromPath(`/store/reaves-way/3d/${token}`)).toBe(token);
  });

  it("rejects malformed, short, or unrelated paths before thumbnail storage is consulted", () => {
    expect(sharedRoomTokenFromPath("/3d/short")).toBeNull();
    expect(sharedRoomTokenFromPath(`/3d/${token}.jpg`)).toBeNull();
    expect(sharedRoomTokenFromPath(`/api/shared-3d-preview/${token}.jpg`)).toBeNull();
    expect(sharedRoomTokenFromPath("/design")).toBeNull();
  });
});
