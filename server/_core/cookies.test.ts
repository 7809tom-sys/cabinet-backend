import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { getSessionCookieOptions } from "./cookies";

function requestFor(hostname: string): Request {
  return {
    hostname,
    protocol: "https",
    headers: {},
  } as Request;
}

describe("getSessionCookieOptions", () => {
  it("keeps affiliate sessions host-only so sibling sites remain independent", () => {
    const options = getSessionCookieOptions(requestFor("reaves-way-cabinet-shop.cabinetdealz.com"));
    expect(options.domain).toBeUndefined();
    expect(options).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: true,
    });
  });

  it("uses the same host-only behavior for the platform site", () => {
    expect(getSessionCookieOptions(requestFor("www.cabinetdealz.com")).domain).toBeUndefined();
    expect(getSessionCookieOptions(requestFor("cabinetdealz.com")).domain).toBeUndefined();
  });

  it("does not broaden a session cookie to an unrelated custom domain", () => {
    expect(getSessionCookieOptions(requestFor("kitchens.example.com")).domain).toBeUndefined();
  });
});
