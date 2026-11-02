import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { AFFILIATE_EMAIL_SETTINGS_PROVIDERS } from "@shared/affiliateEmailSettingsContract";
import { normalizeAppPassword } from "@shared/affiliateEmailSettingsContract";
import {
  loadSenderSettingsView,
  runSenderTestFromContract,
  updateSenderSettingsFromContract,
} from "../lib/affiliateSenderSettings";

// The affiliate dashboard (cabinet-frontend PR 232) calls these three names with
// its own field vocabulary. They are thin aliases of `crm.emailSetup.*`: both
// surfaces delegate to server/lib/affiliateSenderSettings.ts, so authorization
// is identical — a platform admin must name the store, an affiliate owner may
// only touch their own, and team members are refused. Keeping one implementation
// means the password can never be handled differently on one path than the other.

const affiliateIdInput = z.object({ affiliateId: z.number().int().positive() });

const updateInput = z.object({
  affiliateId: z.number().int().positive(),
  email: z.string().trim().max(320),
  provider: z.enum(AFFILIATE_EMAIL_SETTINGS_PROVIDERS),
  smtpHost: z.string().trim().max(255),
  smtpPort: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().trim().max(255),
  enabled: z.boolean(),
  /**
   * Write-only. Omitted (or blank) keeps the stored app password. Google shows
   * app passwords with spaces, so they are stripped before encryption.
   */
  appPassword: z.string().max(2000).optional(),
});

export const affiliateEmailSettingsRouter = router({
  get: protectedProcedure
    .input(affiliateIdInput)
    .query(async ({ ctx, input }) => {
      if (!(await getDb())) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      }
      return loadSenderSettingsView(ctx, input.affiliateId);
    }),

  update: protectedProcedure
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      if (!(await getDb())) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      }
      const appPassword = normalizeAppPassword(input.appPassword);
      return updateSenderSettingsFromContract(ctx, {
        ...input,
        // A whitespace-only field is "no new password", not an empty one.
        appPassword: appPassword.length > 0 ? appPassword : undefined,
      });
    }),

  // Sends only to the affiliate's own saved address and returns the provider's
  // exact error text when it fails.
  sendTest: protectedProcedure
    .input(affiliateIdInput)
    .mutation(async ({ ctx, input }) => {
      if (!(await getDb())) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      }
      return runSenderTestFromContract(ctx, input.affiliateId);
    }),
});
