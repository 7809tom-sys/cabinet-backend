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
  it("shares a new first-party session with Cabinet Dealz affiliate subdomains", () => {
    expect(getSessionCookieOptions(requestFor("reaves-way-cabinet-shop.cabinetdealz.com"))).toMatchObject({
      domain: ".cabinetdealz.com",
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: true,
    });
  });

  it("does not broaden a session cookie to an unrelated custom domain", () => {
    expect(getSessionCookieOptions(requestFor("kitchens.example.com")).domain).toBeUndefined();
  });
});
