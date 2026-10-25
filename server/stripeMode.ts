export type StripeEnvironment = "production" | "test" | "unknown";

/** Classifies only a Stripe key prefix; it never returns or logs a credential. */
export function stripeEnvironmentFromKeys(secretKey: string | null | undefined, publishableKey: string | null | undefined): StripeEnvironment {
  const key = secretKey?.trim() || publishableKey?.trim() || "";
  if (key.startsWith("sk_live_") || key.startsWith("pk_live_")) return "production";
  if (key.startsWith("sk_test_") || key.startsWith("pk_test_")) return "test";
  return "unknown";
}
