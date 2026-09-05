import { describe, expect, it } from "vitest";
import { verifySmtpConnection } from "./email";

describe("transactional email configuration", () => {
  it("connects to the configured SMTP service without sending an email", async () => {
    const result = await verifySmtpConnection();

    expect(result.ok, result.error ?? "SMTP connection could not be verified").toBe(true);
  }, 20_000);
});
