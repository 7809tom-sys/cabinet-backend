import { describe, expect, it } from "vitest";
import {
  bothSampleImagesVerified,
  buildDoorStyleRoomScenePrompt,
  generationDecision,
  nextSampleVerifiedFlag,
  type SampleImageState,
} from "./doorStyleRoomSceneGeneration";

const ready: SampleImageState = {
  doorSampleImageUrl: " https://cdn.example/door.jpg ",
  drawerSampleImageUrl: "https://cdn.example/drawer.jpg",
  doorSampleVerified: true,
  drawerSampleVerified: true,
};

describe("door style room scene trigger", () => {
  it("waits until both photos are uploaded and verified", () => {
    expect(bothSampleImagesVerified(ready)).toBe(true);
    expect(bothSampleImagesVerified({ ...ready, doorSampleImageUrl: "  " })).toBe(false);
    expect(bothSampleImagesVerified({ ...ready, drawerSampleImageUrl: null })).toBe(false);
    expect(bothSampleImagesVerified({ ...ready, doorSampleVerified: false })).toBe(false);
    expect(bothSampleImagesVerified({ ...ready, drawerSampleVerified: false })).toBe(false);
  });

  it("starts once for a verified pair and does not start again for the same pair", () => {
    expect(generationDecision(ready, null)).toEqual({ action: "start", reason: "first-time" });
    const same = {
      status: "ready" as const,
      doorImageUrl: "https://cdn.example/door.jpg",
      drawerImageUrl: "https://cdn.example/drawer.jpg",
    };
    expect(generationDecision(ready, same)).toEqual({ action: "skip", reason: "same-images-ready" });
    expect(generationDecision(ready, { ...same, status: "generating" })).toEqual({ action: "skip", reason: "same-images-in-progress" });
    expect(generationDecision(ready, { ...same, status: "pending" })).toEqual({ action: "skip", reason: "same-images-in-progress" });
    expect(generationDecision(ready, { ...same, status: "failed" })).toEqual({ action: "skip", reason: "same-images-failed" });
    expect(generationDecision(ready, { ...same, status: "failed" }, { forceRetry: true }).action).toBe("start");
  });

  it("regenerates only after a replaced photo is verified again", () => {
    const previous = {
      status: "ready" as const,
      doorImageUrl: "https://cdn.example/door.jpg",
      drawerImageUrl: "https://cdn.example/drawer.jpg",
    };
    const replaced = { ...ready, drawerSampleImageUrl: "https://cdn.example/drawer-2.jpg", drawerSampleVerified: false };
    expect(generationDecision(replaced, previous)).toEqual({ action: "skip", reason: "not-ready" });
    expect(generationDecision({ ...replaced, drawerSampleVerified: true }, previous)).toEqual({ action: "start", reason: "images-replaced" });
  });

  it("clears verification when a vendor replaces a photo and keeps an admin replacement verified", () => {
    expect(nextSampleVerifiedFlag({
      isAdmin: false,
      previousUrl: "https://cdn.example/door.jpg",
      nextUrl: "https://cdn.example/door-new.jpg",
    })).toBe(false);
    expect(nextSampleVerifiedFlag({
      isAdmin: true,
      previousUrl: "https://cdn.example/door.jpg",
      nextUrl: "https://cdn.example/door-new.jpg",
    })).toBe(true);
    expect(nextSampleVerifiedFlag({
      isAdmin: true,
      previousUrl: "https://cdn.example/door.jpg",
      nextUrl: "https://cdn.example/door.jpg",
    })).toBeUndefined();
    expect(nextSampleVerifiedFlag({
      isAdmin: false,
      previousUrl: "https://cdn.example/door.jpg",
      nextUrl: null,
    })).toBe(false);
  });

  it("asks the room-scene model to follow the door and the drawer front", () => {
    const prompt = buildDoorStyleRoomScenePrompt({ ourName: "Lumina Blanc", doorStyle: "Shaker", color: "White", finish: "Painted" });
    expect(prompt).toContain("verified cabinet door");
    expect(prompt).toContain("verified drawer front");
    expect(prompt).toContain("Lumina Blanc");
    expect(prompt).toContain("Shaker");
  });
});
