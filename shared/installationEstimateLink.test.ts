import { describe, expect, it } from "vitest";
import { installationEstimateDocumentPath } from "./installationEstimateLink";

describe("installationEstimateDocumentPath", () => {
  it("creates the separate public installation document path without mixing it into a material order route", () => {
    expect(installationEstimateDocumentPath("abc123")).toBe("/installation-estimate/abc123");
  });

  it("encodes an opaque document token before placing it in the URL", () => {
    expect(installationEstimateDocumentPath("token / value")).toBe("/installation-estimate/token%20%2F%20value");
  });
});
