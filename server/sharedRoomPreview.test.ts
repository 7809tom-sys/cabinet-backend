import { describe, expect, it } from "vitest";
import { sharedRoomPreviewDocument, sharedRoomTokenFromPath } from "./sharedRoomPreview";

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

  it("builds a noindex social-card document with a token-scoped thumbnail before redirecting a human recipient to the existing 3D route", () => {
    const document = sharedRoomPreviewDocument({
      canonicalUrl: `https://www.cabinetdealz.com/api/shared-3d-view/${token}`,
      destinationUrl: `https://www.cabinetdealz.com/3d/${token}?view=v1.camera-state`,
      thumbnailUrl: `https://www.cabinetdealz.com/api/shared-3d-preview/${token}.jpg`,
    });

    expect(document).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(document).toContain(`<meta property="og:image" content="https://www.cabinetdealz.com/api/shared-3d-preview/${token}.jpg" />`);
    expect(document).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(document).toContain(`<meta http-equiv="refresh" content="0;url=https://www.cabinetdealz.com/3d/${token}?view=v1.camera-state">`);
    expect(document).toContain(`<a href="https://www.cabinetdealz.com/3d/${token}?view=v1.camera-state">Open shared 3D view</a>`);
    expect(document).not.toContain("thumbnailKey");
  });
});
