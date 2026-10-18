import { passwordResetUrl } from "./passwordReset.logic";

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPasswordResetEmail(options: {
  recipientName?: string | null;
  token: string;
  origin: string;
}) {
  const recipient = options.recipientName?.trim() || "there";
  const resetUrl = passwordResetUrl(options.origin, options.token);
  const subject = "Cabinet Dealz — reset your password";
  const text = [
    `Hello ${recipient},`,
    "",
    "Use this private, one-time link to create a new Cabinet Dealz password:",
    resetUrl,
    "",
    "The link expires in one hour and can only be used once. If you did not request this, you can ignore this email.",
  ].join("\n");
  const html = [
    `<p>Hello ${htmlEscape(recipient)},</p>`,
    `<p><a href="${htmlEscape(resetUrl)}">Create a new Cabinet Dealz password</a></p>`,
    "<p>This private link expires in one hour and can only be used once. If you did not request this, you can ignore this email.</p>",
  ].join("");

  return { subject, text, html, resetUrl };
}
