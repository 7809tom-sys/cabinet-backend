import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { sendEmail } from "../email";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Emails a project-owner notification to OWNER_EMAIL through the site's SMTP
 * (sendEmail). Returns `true` when the message was sent, `false` when email is
 * not configured or delivery failed (callers treat alerts as best-effort).
 * Validation errors bubble up as TRPC errors so callers can fix the payload.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  try {
    const result = await sendEmail({
      to: ENV.ownerEmail,
      subject: `[Cabinet Dealz] ${title}`,
      text: content,
      html: `<h3>${escapeHtml(title)}</h3><div style="white-space:pre-wrap">${escapeHtml(content)}</div>`,
    });
    if (!result.success) {
      console.warn(`[Notification] Owner email not sent: ${result.error ?? "unknown error"}`);
    }
    return result.success;
  } catch (error) {
    console.warn("[Notification] Error sending owner email:", error);
    return false;
  }
}
