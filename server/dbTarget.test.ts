import { describe, expect, it } from "vitest";
import { describeDatabaseTarget } from "./db";

/**
 * The 6 Nov 2026 outage had two plausible shapes: the columns were never added,
 * or the deploy was pointed at a different database than the one that was
 * altered. Nothing in the runtime log could tell them apart, because the server
 * never said which database it had opened. This is the line that answers it.
 *
 * It must never be able to print a credential.
 */
describe("describeDatabaseTarget", () => {
  it("names the host and database a deploy actually opened", () => {
    expect(describeDatabaseTarget("mysql://app_user:s3cret@tidb.example.net:4000/cabinet_dealz?ssl=true"))
      .toBe("tidb.example.net:4000/cabinet_dealz");
  });

  it("works without a port, a query string, or a password", () => {
    expect(describeDatabaseTarget("mysql://user@db.example.net/cabinet_dealz"))
      .toBe("db.example.net/cabinet_dealz");
  });

  it("names a URL that carries no database, rather than looking healthy", () => {
    expect(describeDatabaseTarget("mysql://user:pw@db.example.net:4000"))
      .toBe("db.example.net:4000/(no database in URL)");
  });

  it("never returns a user, a password, or a query string", () => {
    const url =
      "mysql://app_user:sup3r-s3cret-pw@tidb.example.net:4000/cabinet_dealz?ssl=%7B%22minVersion%22%3A%22TLSv1.2%22%7D";
    const described = describeDatabaseTarget(url);
    expect(described).not.toContain("app_user");
    expect(described).not.toContain("sup3r-s3cret-pw");
    expect(described).not.toContain("ssl");
    expect(described).toBe("tidb.example.net:4000/cabinet_dealz");
  });

  it("says so when DATABASE_URL is unset, instead of throwing", () => {
    expect(describeDatabaseTarget(undefined)).toBe("DATABASE_URL is not set");
    expect(describeDatabaseTarget("")).toBe("DATABASE_URL is not set");
    expect(describeDatabaseTarget("   ")).toBe("DATABASE_URL is not set");
  });

  it("says so when DATABASE_URL is not a URL, instead of echoing it", () => {
    expect(describeDatabaseTarget("not-a-url:s3cret")).toBe("DATABASE_URL is not a MySQL connection URL");
    // A non-MySQL scheme is refused rather than parsed into something that
    // reads like a real target.
    expect(describeDatabaseTarget("https://user:pw@example.net/cabinet_dealz"))
      .toBe("DATABASE_URL is not a MySQL connection URL");
  });
});
