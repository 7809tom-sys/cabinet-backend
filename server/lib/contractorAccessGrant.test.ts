import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { contractorAccessRequests, users } from "../../drizzle/schema";
import { linkApprovedContractorAccess } from "./contractorAccessGrant";

type StoredRequest = {
  id: number;
  userId: number | null;
  contractorEmail: string | null;
  status: string;
};

function grantDb(rows: StoredRequest[]) {
  const updates: { table: string; set: Record<string, unknown> }[] = [];
  let selects = 0;
  const db = {
    select: () => ({
      from: () => ({
        where: () => {
          selects += 1;
          return Promise.resolve(rows);
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: async () => {
          updates.push({
            table: table === users ? "users" : table === contractorAccessRequests ? "requests" : "other",
            set: vals,
          });
        },
      }),
    }),
  };
  return { db: db as never, updates, readSelects: () => selects };
}

const approved = {
  id: 15,
  userId: null,
  contractorEmail: "pat@shop.test",
  status: "approved",
};

describe("linkApprovedContractorAccess", () => {
  it("links the approved request and grants contractor when that email signs up as a user", async () => {
    const { db, updates } = grantDb([
      approved,
      { id: 2, userId: null, contractorEmail: "pat@shop.test", status: "pending" },
      { id: 3, userId: 4, contractorEmail: "pat@shop.test", status: "approved" },
      { id: 4, userId: null, contractorEmail: "other@shop.test", status: "approved" },
    ]);
    const linked = await linkApprovedContractorAccess(db, {
      id: 21,
      role: "user",
      email: "Pat@Shop.test",
    });
    expect(linked).toMatchObject({ id: 21, role: "contractor", email: "Pat@Shop.test" });
    expect(updates.map((update) => update.table)).toEqual(["users", "requests"]);
    expect(updates[0].set).toEqual({ role: "contractor" });
    expect(updates[1].set).toEqual({ userId: 21 });
  });

  it("links the row without downgrading an affiliate or an admin", async () => {
    for (const role of ["partner", "affiliate", "admin", "distributor"]) {
      const { db, updates } = grantDb([approved]);
      const linked = await linkApprovedContractorAccess(db, {
        id: 5,
        role,
        email: "pat@shop.test",
      });
      expect(linked.role).toBe(role);
      expect(updates).toEqual([{ table: "requests", set: { userId: 5 } }]);
    }
  });

  it("does nothing when the email has no approved unlinked request", async () => {
    const { db, updates } = grantDb([
      { id: 2, userId: null, contractorEmail: "pat@shop.test", status: "pending" },
    ]);
    const linked = await linkApprovedContractorAccess(db, {
      id: 21,
      role: "user",
      email: "pat@shop.test",
    });
    expect(linked.role).toBe("user");
    expect(updates).toEqual([]);
  });

  it("skips the lookup when the account has no email and survives a database error", async () => {
    const { db, updates, readSelects } = grantDb([approved]);
    const skipped = await linkApprovedContractorAccess(db, { id: 21, role: "user", email: "  " });
    expect(skipped.role).toBe("user");
    expect(readSelects()).toBe(0);
    expect(updates).toEqual([]);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = {
      select: () => ({
        from: () => ({
          where: () => Promise.reject(new Error("Unknown column 'contractorEmail'")),
        }),
      }),
    };
    const unchanged = await linkApprovedContractorAccess(broken as never, {
      id: 21,
      role: "user",
      email: "pat@shop.test",
    });
    expect(unchanged).toMatchObject({ id: 21, role: "user" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("is wired into signup, legacy upsert, and later Supabase sign-in", () => {
    const dbSource = readFileSync("server/db.ts", "utf8");
    const sdkSource = readFileSync("server/_core/sdk.ts", "utf8");
    const createStart = dbSource.indexOf("export async function createEmailUser");
    const createEnd = dbSource.indexOf("export async function synchronizeApprovedVendorLogin");
    const upsertStart = dbSource.indexOf("export async function upsertUser");
    const upsertEnd = dbSource.indexOf("export async function getUserByOpenId");
    expect(dbSource.slice(createStart, createEnd)).toContain("linkApprovedContractorAccess(db, created)");
    expect(dbSource.slice(upsertStart, upsertEnd)).toContain("linkApprovedContractorAccess");
    expect(sdkSource).toContain("linkApprovedContractorAccess");
    expect(sdkSource.indexOf("synchronizeApprovedVendorLogin")).toBeLessThan(
      sdkSource.indexOf("linkApprovedContractorAccess(database"),
    );
  });
});
