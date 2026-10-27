import { describe, expect, it } from "vitest";
import { bucketForKey, PRIVATE_BUCKET, PUBLIC_BUCKET } from "./storage";

describe("affiliate resource storage", () => {
  it("stores marketing files in the private bucket", () => {
    expect(bucketForKey("affiliate-resources/files/brochure.pdf")).toBe(PRIVATE_BUCKET);
    expect(bucketForKey("media-library/logo.jpg")).toBe(PUBLIC_BUCKET);
  });
});