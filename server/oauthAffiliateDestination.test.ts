import { describe, expect, it } from "vitest";
import { resolveAffiliateAdministrationDestination } from "./oauthAffiliateDestination";

const affiliates = [
  {
    id: 31,
    userId: 901,
    email: "marcussmithreaves@gmail.com",
    status: "active",
  },
  { id: 32, userId: 902, email: "firstclass@example.com", status: "active" },
];

describe("OAuth affiliate Administration destination", () => {
  it("sends a Reaves Way owner from the affiliate management login to the Reaves Way Administration route", () => {
    expect(
      resolveAffiliateAdministrationDestination({
        returnPath: "/affiliate",
        userId: 901,
        email: "marcussmithreaves@gmail.com",
        affiliates,
      })
    ).toBe("/affiliate?viewAs=31");
  });

  it("matches a freshly signed-in owner by Gmail address before the userId link is persisted", () => {
    expect(
      resolveAffiliateAdministrationDestination({
        returnPath: "/affiliate",
        userId: 999,
        email: "MARCUSSMITHREAVES@gmail.com",
        affiliates,
      })
    ).toBe("/affiliate?viewAs=31");
  });

  it("sends an affiliate owner to Affiliate Administration from an ordinary sign-in, but not away from /admin", () => {
    expect(
      resolveAffiliateAdministrationDestination({
        returnPath: "/",
        userId: 901,
        email: "marcussmithreaves@gmail.com",
        userRole: "user",
        affiliates,
      })
    ).toBe("/affiliate?viewAs=31");
    expect(
      resolveAffiliateAdministrationDestination({
        returnPath: "/admin",
        userId: 901,
        email: "marcussmithreaves@gmail.com",
        userRole: "user",
        affiliates,
      })
    ).toBeNull();
  });

  it("does not put platform administrators or inactive affiliates into a store portal", () => {
    expect(
      resolveAffiliateAdministrationDestination({
        returnPath: "/admin",
        userId: 901,
        email: "marcussmithreaves@gmail.com",
        userRole: "admin",
        affiliates,
      })
    ).toBeNull();
    expect(
      resolveAffiliateAdministrationDestination({
        returnPath: "/",
        userId: 55,
        email: "inactive@example.com",
        affiliates: [
          {
            id: 55,
            userId: 55,
            email: "inactive@example.com",
            status: "inactive",
          },
        ],
      })
    ).toBeNull();
    expect(
      resolveAffiliateAdministrationDestination({
        returnPath: "/affiliate",
        userId: 55,
        email: "inactive@example.com",
        affiliates: [
          {
            id: 55,
            userId: 55,
            email: "inactive@example.com",
            status: "inactive",
          },
        ],
      })
    ).toBe("/account");
  });

  it("does not send an ambiguous shared email back to the affiliate landing", () => {
    expect(
      resolveAffiliateAdministrationDestination({
        returnPath: "/affiliate?viewAs=31",
        userId: 50,
        email: "shared@example.com",
        userRole: "user",
        affiliates: [
          {
            id: 31,
            userId: null,
            email: "shared@example.com",
            status: "active",
          },
          {
            id: 32,
            userId: null,
            email: "shared@example.com",
            status: "active",
          },
        ],
      })
    ).toBe("/account");
  });
});
