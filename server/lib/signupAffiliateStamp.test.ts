import { describe, expect, it, vi } from "vitest";
import { describedDatabaseError } from "./orderSchemaGuard";
import {
  queryOrLogMissingColumn,
  runSignupAffiliateStamp,
} from "./signupAffiliateStamp";

describe("signup affiliate stamp", () => {
  it("logs the database message and does not throw", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = Object.assign(
      new Error("Failed query: update `users` set `signupAffiliateId` = ?"),
      {
        cause: {
          code: "ER_BAD_FIELD_ERROR",
          errno: 1054,
          sqlMessage: "Unknown column 'signupAffiliateId' in 'field list'",
        },
      }
    );
    await expect(
      runSignupAffiliateStamp(async () => {
        throw failure;
      })
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      "[Auth] signup affiliate stamp failed",
      "Unknown column 'signupAffiliateId' in 'field list'"
    );
    expect(describedDatabaseError(failure)).toBe(
      "Unknown column 'signupAffiliateId' in 'field list'"
    );
    spy.mockRestore();
  });

  it("logs a missing column on an admin query and rethrows it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = Object.assign(
      new Error("Failed query: select `affiliateId`"),
      {
        cause: {
          code: "ER_BAD_FIELD_ERROR",
          errno: 1054,
          sqlMessage: "Unknown column 'affiliateId' in 'field list'",
        },
      }
    );
    await expect(
      queryOrLogMissingColumn("contractorAccess.list", async () => {
        throw failure;
      })
    ).rejects.toBe(failure);
    expect(spy).toHaveBeenCalledWith(
      "contractorAccess.list",
      "Unknown column 'affiliateId' in 'field list'"
    );
    spy.mockRestore();
  });

  it("does not log an ordinary query failure as a missing column", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      queryOrLogMissingColumn("customers.list", async () => {
        throw new Error("connection reset");
      })
    ).rejects.toThrow("connection reset");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
