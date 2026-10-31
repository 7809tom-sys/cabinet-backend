import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const supplier = (id: number, code: string, isActive: boolean, goLiveAcceptedAt: Date | null = null) => ({
  id, code, name: `Line ${code}`, initials: code[0], brandName: null, brandInitials: null, whiteLabel: true, displayMode: "neutral",
  seriesName: null, isActive, goLiveAcceptedAt,
});
const rows = [
  supplier(1, "LIVE", true),
  supplier(41, "XYZ", false),                       // never went live: admin preview
  supplier(42, "ABC", false),                       // another preview supplier
  supplier(43, "OLD", false, new Date("2026-01-01")), // went live before, switched off: plain switch
];
const mutation = { mutate: vi.fn(), isPending: false };

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ distributorAdmin: { adminList: { invalidate: vi.fn() } } }),
    distributorAdmin: {
      adminList: { useQuery: () => ({ data: rows, isLoading: false }) },
      setBranding: { useMutation: () => mutation },
      setActive: { useMutation: () => mutation },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import LineBrandingEditor from "./LineBrandingEditor";

describe("LineBrandingEditor go live", () => {
  const html = renderToStaticMarkup(createElement(LineBrandingEditor));

  it("marks each preview supplier with the badge and a Go live button", () => {
    expect(html.match(/data-testid="admin-preview-badge"/g)?.length).toBe(2);
    expect(html).toContain("ADMIN PREVIEW — not live");
    expect(html).toContain('data-testid="go-live-XYZ"');
    expect(html).toContain('data-testid="go-live-ABC"');
  });

  it("shows no badge or Go live button for a live supplier or one that already went live before", () => {
    expect(html).not.toContain('data-testid="go-live-LIVE"');
    expect(html).not.toContain('data-testid="go-live-OLD"');
  });
});
