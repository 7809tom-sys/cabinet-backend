export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  // Email auto-promoted to admin when it signs up via email/password.
  ownerEmail: process.env.OWNER_EMAIL ?? "7809tom@gmail.com",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Optional outbound CRM webhook (Zapier / Make / GoHighLevel / any CRM). When
  // set, business events (lead / design saved / order submitted) are POSTed here.
  // Only honor a real http(s) URL. A stray value (e.g. a placeholder word) is
  // treated as unconfigured so events are still recorded but never POSTed to a
  // bogus endpoint.
  crmWebhookUrl: (() => {
    const raw = (process.env.CRM_WEBHOOK_URL ?? "").trim();
    return /^https?:\/\//i.test(raw) ? raw : "";
  })(),
};
