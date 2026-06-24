import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CartProvider } from "@/contexts/CartContext";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { shouldRedirectToLoginOnError } from "./lib/authRedirect";
import "./index.css";

const queryClient = new QueryClient();

const goToLogin = () => {
  if (typeof window === "undefined") return;
  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    // Background QUERY errors NEVER force a redirect (see authRedirect.ts): a
    // guest browsing public pages can trigger a protected query that 401s, and
    // redirecting mid-browse corrupts history so the browser Back button breaks.
    if (shouldRedirectToLoginOnError(error, "query")) goToLogin();
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    // Only a deliberate ACTION (mutation) that fails with "unauthorized" sends
    // the user to log in — an expired session on submit/save/checkout.
    if (shouldRedirectToLoginOnError(error, "mutation")) goToLogin();
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <App />
      </CartProvider>
    </QueryClientProvider>
  </trpc.Provider>
);
