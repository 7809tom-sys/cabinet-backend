export function buildAffiliateSetupInvite(options: {
  affiliateName: string;
  setupToken: string;
  origin: string;
}) {
  const base = options.origin.replace(/\/+$/, "");
  const setupUrl = `${base}/affiliate/setup?token=${encodeURIComponent(options.setupToken)}`;
  return {
    setupUrl,
    subject: `Set up your ${options.affiliateName} Cabinet Dealz account`,
    text: [
      "Hello,",
      "",
      `Your Cabinet Dealz affiliate account for ${options.affiliateName} is ready.`,
      "",
      `Set your password using this one-time link: ${setupUrl}`,
      "This link expires after 24 hours and can only be used once.",
      "",
      "If you did not expect this invitation, you can ignore this email.",
    ].join("\n"),
  };
}
