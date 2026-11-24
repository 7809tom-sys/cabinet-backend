import { describe, expect, it, vi } from "vitest";
import { sendViaResend } from "./email";

describe("sendViaResend headers", () => {
  const env = { RESEND_API_KEY: "test-key", ORDER_EMAIL_FROM: "orders@example.com" } as NodeJS.ProcessEnv;

  it("passes List-Unsubscribe headers through to Resend (mocked fetch, nothing sent)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "re_1" }) });
    await sendViaResend({ to: "a@example.com", subject: "s", text: "t", headers: { "List-Unsubscribe": "<https://x/u/1>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }, env, fetchImpl as unknown as typeof fetch);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.headers).toEqual({ "List-Unsubscribe": "<https://x/u/1>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });

  it("sends no headers field when none are given (existing mail unchanged)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "re_2" }) });
    await sendViaResend({ to: "a@example.com", subject: "s", text: "t" }, env, fetchImpl as unknown as typeof fetch);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty("headers");
  });
});
