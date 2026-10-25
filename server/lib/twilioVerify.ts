import { createHash } from "node:crypto";
import { ENV } from "../_core/env";

type TwilioVerificationResponse = {
  sid?: string;
  status?: string;
};

export function normalizePhoneE164(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  const normalized = trimmed.startsWith("+")
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : `+${digits}`;

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("Enter a valid mobile number with country code, or a 10-digit U.S./Canada mobile number.");
  }
  return normalized;
}

export function hashPhoneE164(phoneE164: string): string {
  return createHash("sha256").update(phoneE164).digest("hex");
}

export function isTwilioVerifyConfigured(): boolean {
  return Boolean(ENV.twilioApiKey && ENV.twilioApiSecret && ENV.twilioVerifyServiceSid);
}

function twilioAuthorizationHeader(): string {
  return `Basic ${Buffer.from(`${ENV.twilioApiKey}:${ENV.twilioApiSecret}`).toString("base64")}`;
}

async function twilioVerifyRequest(path: "Verifications" | "VerificationCheck", body: Record<string, string>): Promise<TwilioVerificationResponse> {
  if (!isTwilioVerifyConfigured()) {
    throw new Error("Phone verification is not configured yet. Please contact Cabinet Dealz for assistance.");
  }

  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(ENV.twilioVerifyServiceSid)}/${path}`,
    {
      method: "POST",
      headers: {
        authorization: twilioAuthorizationHeader(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
    },
  );

  if (!response.ok) {
    throw new Error(path === "Verifications"
      ? "We could not send a verification code. Check the mobile number and try again."
      : "We could not verify that code. Check the code and try again.");
  }

  return response.json() as Promise<TwilioVerificationResponse>;
}

export async function sendTwilioVerification(phoneE164: string): Promise<{ sid: string; status: string }> {
  const response = await twilioVerifyRequest("Verifications", { To: phoneE164, Channel: "sms" });
  if (!response.sid || !response.status) {
    throw new Error("The phone verification service returned an incomplete response. Please try again.");
  }
  return { sid: response.sid, status: response.status };
}

export async function checkTwilioVerification(phoneE164: string, code: string): Promise<boolean> {
  const response = await twilioVerifyRequest("VerificationCheck", { To: phoneE164, Code: code });
  return response.status === "approved";
}
