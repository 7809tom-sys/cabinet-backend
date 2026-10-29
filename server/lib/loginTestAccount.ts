import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { contractorCustomers, crmDeals, kitchenDesigns, orderRequests, users } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { signTestAccountToken, testAccountProfile, testAccountsEnabled } from "./testAccounts";

const SAMPLE_LINES = [{
  cabinetId: null,
  masterCode: "B36",
  description: "Base cabinet 36",
  qty: 2,
  unitPrice: 420,
  linePrice: 840,
  matched: false,
}];

export async function loginTestAccount(username: string, password: string) {
  if (!testAccountsEnabled(process.env.ENABLE_TEST_ACCOUNTS)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
  }
  const profile = testAccountProfile(username.trim().toLowerCase());
  if (!profile || password !== "test") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Those test credentials were not accepted." });
  }
  if (!ENV.cookieSecret) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Set JWT_SECRET on the API before test accounts can sign in.",
    });
  }
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  let [user] = await db.select().from(users).where(eq(users.openId, profile.openId)).limit(1);
  if (!user) {
    const inserted = await db.insert(users).values({
      openId: profile.openId,
      name: profile.name,
      email: profile.email,
      emailLower: profile.email,
      role: profile.role,
      pricingTier: profile.role === "contractor" ? "contractor" : "homeowner",
      loginMethod: "test-account",
    });
    const id = Number((inserted as unknown as [{ insertId: number }])[0].insertId);
    [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  } else if (profile.role === "contractor" && user.role === "user") {
    await db.update(users).set({ role: "contractor", pricingTier: "contractor" }).where(eq(users.id, user.id));
    user = { ...user, role: "contractor", pricingTier: "contractor" };
  }
  if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Test account was not created." });

  await seedSample(user.id, profile.role === "contractor");
  const token = await signTestAccountToken(user.id, ENV.cookieSecret);
  return {
    token,
    role: user.role,
    destination: profile.role === "contractor" ? "/contractor" : "/customer",
  };
}

async function seedSample(userId: number, contractor: boolean) {
  const db = await getDb();
  if (!db) return;
  const designName = contractor ? "Sample contractor kitchen" : "Sample customer kitchen";
  const [existingDesign] = await db.select({ id: kitchenDesigns.id }).from(kitchenDesigns)
    .where(eq(kitchenDesigns.userId, userId)).limit(1);
  let designId = existingDesign?.id ?? null;
  if (designId == null) {
    try {
      const inserted = await db.insert(kitchenDesigns).values({
        userId,
        affiliateId: null,
        name: designName,
        roomLabel: "Kitchen",
        roomType: "Kitchen",
        placedCabinets: [],
      });
      designId = Number((inserted as unknown as [{ insertId: number }])[0].insertId);
    } catch (error) {
      console.warn("[TestAccount] Design seed skipped", error instanceof Error ? error.message : "unknown error");
    }
  }
  const requestNumber = contractor ? "TEST-CONTRACTOR-1" : "TEST-CUSTOMER-1";
  const [existingOrder] = await db.select({ id: orderRequests.id }).from(orderRequests)
    .where(eq(orderRequests.requestNumber, requestNumber)).limit(1);
  if (!existingOrder) {
    try {
      await db.insert(orderRequests).values({
        userId,
        requestNumber,
        originatorName: contractor ? "Sample Homeowner" : "Test Customer",
        originatorEmail: contractor ? "homeowner@cabinetdealz.test" : "customer@cabinetdealz.test",
        status: "confirmed",
        source: "manual",
        lineItems: SAMPLE_LINES,
        itemCount: 2,
        totalAmount: "840.00",
        kitchenDesignId: designId,
        confirmedAt: new Date(),
      });
    } catch (error) {
      console.warn("[TestAccount] Order seed skipped", error instanceof Error ? error.message : "unknown error");
    }
  }
  if (!contractor) return;
  try {
    const [existingCustomer] = await db.select({ id: contractorCustomers.id }).from(contractorCustomers)
      .where(eq(contractorCustomers.contractorUserId, userId)).limit(1);
    if (existingCustomer) return;
    const inserted = await db.insert(contractorCustomers).values({
      contractorUserId: userId,
      name: "Sample Homeowner",
      email: "homeowner@cabinetdealz.test",
      phone: "555-0100",
      notes: "Seeded for the contractor test login.",
    });
    const customerId = Number((inserted as unknown as [{ insertId: number }])[0].insertId);
    await db.insert(crmDeals).values({
      affiliateId: null,
      ownerUserId: userId,
      contractorCustomerId: customerId,
      title: "Sample Homeowner",
      contactName: "Sample Homeowner",
      contactEmail: "homeowner@cabinetdealz.test",
      contactPhone: "555-0100",
      stage: "new",
      source: "manual",
    });
  } catch (error) {
    console.warn("[TestAccount] Contractor customer seed skipped until the SQL file is applied", error instanceof Error ? error.message : "unknown error");
  }
}
