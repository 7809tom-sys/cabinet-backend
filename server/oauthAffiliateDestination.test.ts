import { describe, expect, it } from "vitest";
import { resolveAffiliateAdministrationDestination } from "./oauthAffiliateDestination";

const affiliates = [
  { id: 31, userId: 901, email: "marcussmithreaves@gmail.com", status: "active" },
  { id: 32, userId: 902, email: "firstclass@example.com", status: "active" },
];

describe("OAuth affiliate Administration destination", () => {
  it("sends a Reaves Way owner from the affiliate management login to the Reaves Way Administration route", () => {
    expect(resolveAffiliateAdministrationDestination({
      returnPath: "/affiliate",
      userId: 901,
      email: "marcussmithreaves@gmail.com",
      affiliates,
    })).toBe("/affiliate?viewAs=31");
  });

  it("matches a freshly signed-in owner by Gmail address before the userId link is persisted", () => {
    expect(resolveAffiliateAdministrationDestination({
      returnPath: "/affiliate",
      userId: 999,
      email: "MARCUSSMITHREAVES@gmail.com",
      affiliates,
    })).toBe("/affiliate?viewAs=31");
  });

	  it("sends an affiliate owner to Affiliate Administration even from an ordinary sign-in", () => {
	    expect(resolveAffiliateAdministrationDestination({ returnPath: "/", userId: 901, email: "marcussmithreaves@gmail.com", userRole: "user", affiliates })).toBe("/affiliate?viewAs=31");
	    expect(resolveAffiliateAdministrationDestination({ returnPath: "/admin", userId: 901, email: "marcussmithreaves@gmail.com", userRole: "user", affiliates })).toBe("/affiliate?viewAs=31");
	  });

	  it("does not redirect platform administrators or inactive affiliates", () => {
	    expect(resolveAffiliateAdministrationDestination({ returnPath: "/admin", userId: 901, email: "marcussmithreaves@gmail.com", userRole: "admin", affiliates })).toBeNull();
	    expect(resolveAffiliateAdministrationDestination({
	      returnPath: "/affiliate",
      userId: 55,
      email: "inactive@example.com",
      affiliates: [{ id: 55, userId: 55, email: "inactive@example.com", status: "inactive" }],
    })).toBeNull();
  });
});
