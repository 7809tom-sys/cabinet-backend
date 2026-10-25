const htmlEscape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function normalizedOrigin(origin: string | null | undefined): string {
  const candidate = origin?.trim();
  if (candidate && /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(candidate)) {
    return candidate.replace(/\/$/, "");
  }
  return "https://www.cabinetdealz.com";
}

export function buildSupplierPortalInvite(options: {
  vendorName: string;
  recipientName?: string | null;
  recipientEmail: string;
  inviteToken: string;
  origin?: string | null;
}) {
  const origin = normalizedOrigin(options.origin);
  const setupUrl = `${origin}/vendor?invite=${encodeURIComponent(options.inviteToken)}`;
  const name = options.recipientName?.trim() || "there";
  const vendor = options.vendorName.trim() || "your company";
  const recipient = options.recipientEmail.trim();
  const subject = `Cabinet Dealz Supplier Portal — set up ${vendor}`;
  const text = [
    `Hello ${name},`,
    "",
    `Cabinet Dealz has opened a Supplier Portal for ${vendor}.`,
    "",
    "Use this private, one-time link to choose your supplier login email and password:",
    setupUrl,
    "",
    "After signing in, you can update your own supplier profile, catalog and specification-book resources, and the catalog tools assigned to your supply line.",
    "",
    `This invitation was sent to ${recipient}. If you were not expecting it, you may ignore this email.`,
  ].join("\n");
  const html = [
    `<p>Hello ${htmlEscape(name)},</p>`,
    `<p>Cabinet Dealz has opened a <strong>Supplier Portal</strong> for <strong>${htmlEscape(vendor)}</strong>.</p>`,
    `<p><a href="${htmlEscape(setupUrl)}">Set up your supplier login</a></p>`,
    "<p>This private, one-time link lets you choose your supplier login email and password. After signing in, you can update your own supplier profile, catalog and specification-book resources, and the catalog tools assigned to your supply line.</p>",
    `<p>This invitation was sent to ${htmlEscape(recipient)}. If you were not expecting it, you may ignore this email.</p>`,
  ].join("");

  return { subject, text, html, setupUrl };
}
