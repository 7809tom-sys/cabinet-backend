import { afterEach, describe, expect, it, vi } from "vitest";
import { sendViaResend } from "./email";

const env = { RESEND_API_KEY: "re_test_key", ORDER_EMAIL_FROM: "Cabinet Dealz <orders@cabinetdealz.com>" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Resend email transport", () => {
  it("does nothing when the API key is unset so SMTP can run", async () => {
    const fetchImpl = vi.fn();
    await expect(sendViaResend({ to: "a@b.com", subject: "Hi" }, {}, fetchImpl as unknown as typeof fetch)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back when the from address is missing", async () => {
    const fetchImpl = vi.fn();
    await expect(sendViaResend(
      { to: "a@b.com", subject: "Hi" },
      { RESEND_API_KEY: "re_test_key" },
      fetchImpl as unknown as typeof fetch,
    )).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts to the Resend HTTPS API and records the id", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
    const result = await sendViaResend({
      to: "orders@mill.com",
      cc: ["sales@mill.com"],
      subject: "Purchase Order CD-1",
      text: "Order number: CD-1",
      attachments: [{ filename: "PO-CD-1.csv", content: "a,b" }],
    }, env, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ success: true, messageId: "email_123" });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test_key" });
    const body = JSON.parse(String(init.body));
    expect(body.from).toBe(env.ORDER_EMAIL_FROM);
    expect(body.to).toEqual(["orders@mill.com"]);
    expect(body.attachments[0].content).toBe(Buffer.from("a,b").toString("base64"));
  });

  it("returns the API error instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: "blocked" }), { status: 422 }));
    await expect(sendViaResend({ to: "orders@mill.com", subject: "PO" }, env, fetchImpl as unknown as typeof fetch))
      .resolves.toEqual({ success: false, error: "blocked" });
  });
});
