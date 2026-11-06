// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createElement } from "react";
import superjson from "superjson";

/**
 * Regression guard for the blank admin library page.
 *
 * The page's Open button asks `affiliateResources.adminSignedFile` for a signed
 * link. `fetch` exists only on the tRPC **utils** proxy; on the hook proxy
 * (`trpc.affiliateResources.adminSignedFile`) it is read as a React hook name and
 * throws "hooks[lastArg] is not a function" without sending a request.
 *
 * The other admin-page test mocks `@/lib/trpc`, so it cannot see that mistake.
 * This one wires the real `createTRPCReact()` client, which is what production
 * runs, and asserts a request actually reaches the server.
 */

const toastErrors: string[] = [];
vi.mock("sonner", () => ({
  toast: {
    error: (message: string) => {
      toastErrors.push(String(message));
    },
    success: () => undefined,
  },
}));

vi.mock("@/lib/trpc", async () => {
  const { createTRPCReact } = await import("@trpc/react-query");
  return { trpc: createTRPCReact() };
});

import { trpc } from "@/lib/trpc";
import AffiliateLiteratureAdmin from "./AffiliateLiteratureAdmin";

const rows = [{
  id: 7,
  title: "Website Improvement Proposal — Lessons from Marazzi USA",
  description: "Internal strategy proposal.",
  category: "Internal",
  filename: "website-improvement-proposal.pdf",
  fileKey: "library-documents/internal/website-improvement-proposal.pdf",
  url: "/manus-storage/library-documents/internal/website-improvement-proposal.pdf",
  mimeType: "application/pdf",
  sizeBytes: 92281,
  isPublished: false,
  visibility: "internal",
  affiliateToggledAt: null,
  affiliateToggledByName: null,
  sortOrder: 900,
}];

function Harness({ onCall }: { onCall: (path: string) => void }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = (trpc as never as { createClient: (options: unknown) => unknown }).createClient({
    links: [httpBatchLink({
      url: "http://localhost/api/trpc",
      transformer: superjson,
      fetch: async (input: unknown) => {
        const url = String(input);
        onCall(url);
        const data = url.includes("adminSignedFile")
          ? { url: "https://signed.example/proposal.pdf", filename: "website-improvement-proposal.pdf", mimeType: "application/pdf" }
          : rows;
        return new Response(JSON.stringify([{ result: { data: superjson.serialize(data) } }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    })],
  });
  return createElement(
    (trpc as never as { Provider: never }).Provider as never,
    { client, queryClient } as never,
    createElement(AffiliateLiteratureAdmin),
  );
}

describe("the admin library page on the real tRPC client", () => {
  it("opens a document by asking the server for a signed link", async () => {
    toastErrors.length = 0;
    const calls: string[] = [];
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(createElement(Harness, { onCall: (path: string) => calls.push(path) }));
    await waitFor(() => expect(screen.getByText(/Website Improvement Proposal/)).toBeTruthy(), { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: /^Open Website Improvement Proposal/ }));
    await waitFor(() => expect(openSpy).toHaveBeenCalled(), { timeout: 3000 });

    // The request left the browser. On the hook proxy it never would.
    expect(calls.some((call) => call.includes("affiliateResources.adminSignedFile"))).toBe(true);
    expect(openSpy.mock.calls[0]?.[0]).toBe("https://signed.example/proposal.pdf");
    // The private-bucket path must never be opened directly.
    expect(calls.some((call) => call.includes("/manus-storage/"))).toBe(false);
    expect(toastErrors).toEqual([]);

    openSpy.mockRestore();
  });
});
