import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.hoisted(() => vi.fn(async () => ({ messageId: "smtp_1" })));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

import { deliverCrmMessage } from "./lib/crmOutboundMail";
import { isEmailConfigured, resendConfigured, sendEmail, sendViaResend, type EmailSettingsRow } from "./email";

const env = { RESEND_API_KEY: "re_test_key", ORDER_EMAIL_FROM: "Cabinet Dealz <orders@cabinetdealz.com>" };

afterEach(() => {
  sendMail.mockClear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      files.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe("Resend email transport", () => {
  it("returns not configured without calling the network when Resend is unset", async () => {
    const fetchImpl = vi.fn();
    const result = await sendViaResend(
      { to: "a@b.com", subject: "Hi" },
      { SMTP_HOST: "smtp.example.com", SMTP_USER: "user", SMTP_PASS: "secret" } as NodeJS.ProcessEnv,
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toMatchObject({ success: false, notConfigured: true });
    expect(result.error).toMatch(/RESEND_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns not configured when the from address is missing and does not print the API key", async () => {
    const fetchImpl = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendViaResend(
      { to: "a@b.com", subject: "Hi" },
      { RESEND_API_KEY: "re_secret_value" } as NodeJS.ProcessEnv,
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toMatchObject({ success: false, notConfigured: true });
    expect(result.error).toMatch(/ORDER_EMAIL_FROM/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(error.mock.calls.flat().join(" ")).not.toContain("re_secret_value");
  });

  it("posts attachments and reply-to to the Resend HTTPS API", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
    const pdf = Buffer.from("%PDF-1.4");
    const result = await sendViaResend({
      to: "orders@mill.com",
      cc: ["sales@mill.com"],
      subject: "Purchase Order CD-1",
      text: "Order number: CD-1",
      replyTo: "hello@shop.test",
      attachments: [
        { filename: "PO-CD-1.csv", content: "a,b" },
        { filename: "invoice.pdf", content: pdf, contentType: "application/pdf" },
      ],
    }, env, fetchImpl as unknown as typeof fetch);
    expect(result).toMatchObject({ success: true, messageId: "email_123", transport: "resend" });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test_key" });
    const body = JSON.parse(String(init.body));
    expect(body.from).toBe(env.ORDER_EMAIL_FROM);
    expect(body.to).toEqual(["orders@mill.com"]);
    expect(body.reply_to).toBe("hello@shop.test");
    expect(body.attachments[0].content).toBe(Buffer.from("a,b").toString("base64"));
    expect(body.attachments[1].content).toBe(pdf.toString("base64"));
    expect(body.attachments[1].content_type).toBe("application/pdf");
    expect(JSON.stringify(body)).not.toContain("re_test_key");
  });

  it("returns the API error instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: "blocked" }), { status: 422 }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendViaResend({ to: "orders@mill.com", subject: "PO" }, env, fetchImpl as unknown as typeof fetch))
      .resolves.toMatchObject({ success: false, error: "blocked", transport: "resend" });
    expect(error.mock.calls.flat().join(" ")).toMatch(/\[OrderEmail\] Resend failed/);
    expect(error.mock.calls.flat().join(" ")).not.toContain("re_test_key");
  });

  it("sendEmail uses Resend even when SMTP variables are present", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "email_456" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchImpl);
    const result = await sendEmail({
      to: "buyer@example.com",
      subject: "Quote",
      replyTo: "store@example.com",
      attachments: [{ filename: "quote.pdf", content: Buffer.from("pdf"), contentType: "application/pdf" }],
    }, {
      ...env,
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "user",
      SMTP_PASS: "secret",
    } as NodeJS.ProcessEnv);
    expect(result).toMatchObject({ success: true, messageId: "email_456", transport: "resend" });
    expect(sendMail).not.toHaveBeenCalled();
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.reply_to).toBe("store@example.com");
    expect(body.attachments[0].content_type).toBe("application/pdf");
  });

  it("is ready only when both Resend values are set", () => {
    expect(resendConfigured(env as NodeJS.ProcessEnv)).toBe(true);
    expect(isEmailConfigured(env as NodeJS.ProcessEnv)).toBe(true);
    expect(resendConfigured({ RESEND_API_KEY: "re_test_key" } as NodeJS.ProcessEnv)).toBe(false);
    expect(resendConfigured({ ORDER_EMAIL_FROM: "orders@cabinetdealz.com" } as NodeJS.ProcessEnv)).toBe(false);
    expect(resendConfigured({ SMTP_HOST: "smtp.example.com", SMTP_USER: "u", SMTP_PASS: "p" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("uses SMTP when Resend is unset and logs that path", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await sendEmail({
      to: "buyer@example.com",
      subject: "Quote",
      replyTo: "store@example.com",
    }, {
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "user@example.com",
      SMTP_PASS: "secret",
      SMTP_FROM: "orders@example.com",
    } as NodeJS.ProcessEnv);
    expect(result).toMatchObject({ success: true, messageId: "smtp_1", transport: "smtp", from: "orders@example.com" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: "store@example.com", from: "orders@example.com" }));
    expect(log.mock.calls.flat().join(" ")).toMatch(/sent via SMTP/);
  });

  it("uses saved email settings when Resend and SMTP env are unset", async () => {
    const settings: EmailSettingsRow = {
      smtpHost: "smtp.settings.test",
      smtpPort: 465,
      smtpUser: "settings@example.com",
      smtpPass: "plain-secret",
      smtpFrom: "settings@example.com",
      enabled: true,
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await sendEmail({ to: "buyer@example.com", subject: "PO" }, {} as NodeJS.ProcessEnv, settings);
    expect(result.transport).toBe("smtp");
    expect(result.success).toBe(true);
    expect(log.mock.calls.flat().join(" ")).toMatch(/sent via SMTP settings/);
    expect(JSON.stringify(sendMail.mock.calls)).not.toContain("re_test_key");
  });

  it("fails closed when neither Resend nor SMTP is configured", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendEmail({ to: "buyer@example.com", subject: "PO" }, {} as NodeJS.ProcessEnv, null);
    expect(result).toMatchObject({ success: false, notConfigured: true });
    expect(sendMail).not.toHaveBeenCalled();
    expect(error.mock.calls.flat().join(" ")).toMatch(/\[Email\] send failed/);
  });

  it("keeps the SMTP client inside the shared sender only", () => {
    const roots = ["server", "shared", "client/src"].map((dir) => path.resolve(dir));
    const hits = roots.flatMap(sourceFiles).filter((file) => /from ["']nodemailer["']/.test(readFileSync(file, "utf8")));
    expect(hits.map((file) => path.relative(process.cwd(), file))).toEqual(["server/email.ts"]);
  });
});

describe("CRM delivery through Resend", () => {
  it("sends the invoice PDF with the affiliate reply-to and logs success", async () => {
    vi.stubEnv("RESEND_API_KEY", env.RESEND_API_KEY);
    vi.stubEnv("ORDER_EMAIL_FROM", env.ORDER_EMAIL_FROM);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "email_pdf" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchImpl);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await deliverCrmMessage({
      ok: true,
      channel: "affiliate",
      from: env.ORDER_EMAIL_FROM,
      replyTo: "hello@shop.test",
      signatureHtml: "<p>Thanks</p>",
    }, {
      to: "customer@example.com",
      subject: "Invoice",
      text: "Attached",
      html: "<p>Invoice</p>",
      attachments: [{ filename: "inv.pdf", content: Buffer.from("%PDF"), contentType: "application/pdf" }],
    });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.reply_to).toBe("hello@shop.test");
    expect(body.attachments[0].content).toBe(Buffer.from("%PDF").toString("base64"));
    expect(body.attachments[0].content_type).toBe("application/pdf");
    expect(body.html).toContain("Thanks");
    expect(log.mock.calls.flat().join(" ")).toMatch(/\[CRM email\] Resend sent/);
  });

  it("falls back to SMTP and logs that path when Resend is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("ORDER_EMAIL_FROM", "");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "465");
    vi.stubEnv("SMTP_USER", "user@example.com");
    vi.stubEnv("SMTP_PASS", "secret");
    vi.stubEnv("SMTP_FROM", "orders@example.com");
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const sent = await deliverCrmMessage({
      ok: true,
      channel: "platform",
      from: "Cabinet Dealz",
      signatureHtml: "",
    }, {
      to: "customer@example.com",
      subject: "Invoice",
      text: "Attached",
      html: "<p>Invoice</p>",
    });
    expect(sent.transport).toBe("smtp");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join(" ")).toMatch(/\[CRM email\] SMTP sent/);
  });

  it("logs a failure and does not send when neither path is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("ORDER_EMAIL_FROM", "");
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(deliverCrmMessage({
      ok: true,
      channel: "platform",
      from: "Cabinet Dealz",
      signatureHtml: "",
    }, {
      to: "customer@example.com",
      subject: "Invoice",
      text: "Attached",
      html: "<p>Invoice</p>",
    })).rejects.toMatchObject({ message: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(error.mock.calls.flat().join(" ")).toMatch(/\[CRM email\] Email failed/);
  });
});
