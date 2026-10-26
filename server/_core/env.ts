export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  // Legacy Supabase Auth HMAC secret. Used only when an access token header
  // says HS256. Current projects sign tokens with ES256 and are checked via JWKS.
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? "",
  // Auth API origin for the JWKS document. Railway sets VITE_SUPABASE_URL only.
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
  // Server-only admin key. Never expose through Vite.
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  // Email auto-promoted to admin when it signs up via email/password.
  ownerEmail: process.env.OWNER_EMAIL ?? "7809tom@gmail.com",
  isProduction: process.env.NODE_ENV === "production",
  // Optional outbound CRM webhook (Zapier / Make / GoHighLevel / any CRM). When
  // set, business events (lead / design saved / order submitted) are POSTed here.
  // Only honor a real http(s) URL. A stray value (e.g. a placeholder word) is
  // treated as unconfigured so events are still recorded but never POSTed to a
  // bogus endpoint.
  crmWebhookUrl: (() => {
    const raw = (process.env.CRM_WEBHOOK_URL ?? "").trim();
    return /^https?:\/\//i.test(raw) ? raw : "";
  })(),
  // Stripe payment processing
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
  // QuickBooks Online
  qboClientId: process.env.QBO_CLIENT_ID ?? "",
  qboClientSecret: process.env.QBO_CLIENT_SECRET ?? "",
  // Authorize.Net
  authorizeNetApiLoginId: process.env.AUTHORIZE_NET_API_LOGIN_ID ?? "",
  authorizeNetTransactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY ?? "",
  // Twilio Verify is used only by server-side image-request procedures. These
  // values are intentionally absent from all client-side environment exposure.
  twilioApiKey: process.env.TWILIO_API_KEY ?? "",
  twilioApiSecret: process.env.TWILIO_API_SECRET ?? "",
  twilioVerifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID ?? "",
  // Gemini Nano Banana image generation is server-only. Never expose this key
  // through Vite or return it from an administrator status endpoint.
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  // Google Maps Platform key for server-side geocoding (shipping/location checks).
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  // ElevenLabs supports approved server-mediated audio workflows only. Never
  // publish this credential through Vite or return it from status procedures.
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? "",
};
