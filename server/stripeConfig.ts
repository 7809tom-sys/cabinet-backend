import { ENV } from "./_core/env";
import { stripeEnvironmentFromKeys, type StripeEnvironment } from "./stripeMode";

export type StripeCredentialSource = "protected_live_override" | "managed_sandbox";

export interface StripeCredentialConfiguration {
  source: StripeCredentialSource;
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  environment: StripeEnvironment;
  secretKeyConfigured: boolean;
  publishableKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  matchingKeyModes: boolean;
  liveReady: boolean;
  validationMessage: string | null;
}

type EnvironmentValues = Record<string, string | undefined>;

const directLiveKeys = (values: EnvironmentValues) => ({
  secretKey: (values.CABINETDEALZ_STRIPE_LIVE_SECRET_KEY ?? "").trim(),
  publishableKey: (values.CABINETDEALZ_STRIPE_LIVE_PUBLISHABLE_KEY ?? "").trim(),
  webhookSecret: (values.CABINETDEALZ_STRIPE_LIVE_WEBHOOK_SECRET ?? "").trim(),
});

const managedKeys = (values: EnvironmentValues) => ({
  secretKey: (values.STRIPE_SECRET_KEY ?? ENV.stripeSecretKey ?? "").trim(),
  publishableKey: (values.VITE_STRIPE_PUBLISHABLE_KEY ?? ENV.stripePublishableKey ?? "").trim(),
  webhookSecret: (values.STRIPE_WEBHOOK_SECRET ?? ENV.stripeWebhookSecret ?? "").trim(),
});

/**
 * Resolves Stripe credentials without returning them to a client. A direct key
 * entry is used only when at least one protected CabinetDealz live-key field is
 * present; this avoids silently mixing a newly supplied live secret with the
 * platform-managed test sandbox. Incomplete or non-live direct fields disable
 * Checkout and report a safe status message instead of falling back to test.
 */
export function resolveStripeCredentials(values: EnvironmentValues = process.env): StripeCredentialConfiguration {
  const direct = directLiveKeys(values);
  const hasDirectEntry = Boolean(direct.secretKey || direct.publishableKey || direct.webhookSecret);
  const keys = hasDirectEntry ? direct : managedKeys(values);
  const source: StripeCredentialSource = hasDirectEntry ? "protected_live_override" : "managed_sandbox";
  const environment = stripeEnvironmentFromKeys(keys.secretKey, keys.publishableKey);
  const secretKeyConfigured = Boolean(keys.secretKey);
  const publishableKeyConfigured = Boolean(keys.publishableKey);
  const webhookSecretConfigured = Boolean(keys.webhookSecret);
  const matchingKeyModes = (keys.secretKey.startsWith("sk_live_") && keys.publishableKey.startsWith("pk_live_"))
    || (keys.secretKey.startsWith("sk_test_") && keys.publishableKey.startsWith("pk_test_"));
  const directKeysAreLive = keys.secretKey.startsWith("sk_live_") && keys.publishableKey.startsWith("pk_live_");
  const liveReady = source === "protected_live_override"
    && directKeysAreLive
    && webhookSecretConfigured
    && environment === "production";

  let validationMessage: string | null = null;
  if (source === "protected_live_override" && !liveReady) {
    validationMessage = !secretKeyConfigured || !publishableKeyConfigured || !webhookSecretConfigured
      ? "Enter all three protected live Stripe values before Checkout can switch to live mode."
      : !directKeysAreLive
        ? "Protected CabinetDealz Stripe entries must use matching sk_live_ and pk_live_ keys."
        : "The protected live Stripe webhook signing secret must begin with whsec_.";
  } else if (source === "managed_sandbox" && environment === "test") {
    validationMessage = "CabinetDealz is using its managed Stripe test sandbox.";
  }

  return {
    source,
    secretKey: keys.secretKey,
    publishableKey: keys.publishableKey,
    webhookSecret: keys.webhookSecret,
    environment,
    secretKeyConfigured,
    publishableKeyConfigured,
    webhookSecretConfigured,
    matchingKeyModes,
    liveReady,
    validationMessage,
  };
}

export function requireStripeCredentials(): StripeCredentialConfiguration {
  const credentials = resolveStripeCredentials();
  if (!credentials.secretKeyConfigured) {
    throw new Error("Stripe secret key is not configured");
  }
  if (credentials.source === "protected_live_override" && !credentials.liveReady) {
    throw new Error(credentials.validationMessage ?? "Protected live Stripe configuration is incomplete.");
  }
  return credentials;
}
