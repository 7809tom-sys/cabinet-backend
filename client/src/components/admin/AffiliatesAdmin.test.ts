import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const affiliates = [
  { id: 1, storeName: "First Class Flooring & Cabinet Design", slug: "firstclass", status: "active", referralCode: "FIRSTCLASS", commissionRate: "0.05", contactName: null, email: null, phone: null, location: null, w9Status: "pending", template: "classic" },
  { id: 5730001, storeName: "Reaves Way Cabinet Shop.", slug: "reaves-way-cabinet-shop", status: "active", referralCode: "REAVESWAYCABINETSHOP", commissionRate: "0.05", contactName: null, email: null, phone: null, location: null, w9Status: "pending", template: "classic" },
];

const mutation = { mutate: vi.fn(), isPending: false };

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ affiliates: { adminList: { invalidate: vi.fn() } } }),
    affiliates: {
      adminList: { useQuery: () => ({ data: affiliates, isLoading: false, error: null, refetch: vi.fn() }) },
      adminCreate: { useMutation: () => mutation },
      adminUpdate: { useMutation: () => mutation },
      adminSendCredentials: { useMutation: () => mutation },
      adminVerifyW9: { useMutation: () => mutation },
      adminUpdateMarkup: { useMutation: () => mutation },
      adminUpsertStyleBranding: { useMutation: () => mutation },
      adminInviteSalesDemo: { useMutation: () => mutation },
      adminBranding: { useQuery: () => ({ data: null, isLoading: false }) },
      adminEarnings: { useQuery: () => ({ data: null, isLoading: false }) },
      adminReferrals: { useQuery: () => ({ data: null, isLoading: false }) },
    },
    crm: { adminAffiliateDeals: { useQuery: () => ({ data: [], isLoading: false }) } },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AffiliatesAdmin from "./AffiliatesAdmin";

describe("AffiliatesAdmin portal actions", () => {
  it("renders portal and full-page links for the matching affiliate row", () => {
    const html = renderToStaticMarkup(createElement(AffiliatesAdmin));

    expect(html).toContain('href="/affiliate?viewAs=1"');
    expect(html).toContain('href="/affiliate?viewAs=5730001"');
    expect(html).not.toMatch(/href="\/affiliate"(?!\?viewAs=)/);
    expect(html).toContain("Invite to Sales Demo");
  });
});
