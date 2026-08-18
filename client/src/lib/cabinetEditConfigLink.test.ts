import { describe, expect, it } from "vitest";
import { cabinetEditConfigLink } from "./cabinetEditConfigLink";

describe("cabinetEditConfigLink", () => {
  it("exposes an isolated Edit Config destination for an administrator-provided URL", () => {
    expect(cabinetEditConfigLink("/catalog/B-30?edit=1")).toEqual({
      href: "/catalog/B-30?edit=1",
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("does not expose an Edit Config destination without administrator access", () => {
    expect(cabinetEditConfigLink(undefined)).toBeNull();
  });
});
