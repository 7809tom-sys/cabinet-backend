import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Distributor portal access: a user with role=distributor (scoped to their own
// supply line) or an admin. The distributor's line id is exposed as
// ctx.distributorId; for distributors it is their users.distributorId, for
// admins it is null (they may pass a distributorId explicitly in the input).
export const distributorProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    const isAdmin = ctx.user.role === "admin";
    const isDistributor = ctx.user.role === "distributor";
    if (!isAdmin && !isDistributor) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Distributor access required" });
    }
    if (isDistributor && ctx.user.distributorId == null) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Your account is not linked to a supply line yet. Contact the platform admin.",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        isAdmin,
        distributorId: isDistributor ? ctx.user.distributorId : null,
      },
    });
  }),
);

// Supplier profile access: every approved vendor contact is a distributor-role
// account, but a newly approved supplier may not have a catalog/distributor line
// yet. It can edit only its own approved-vendor profile until that line exists.
export const supplierProfileProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    const isAdmin = ctx.user.role === "admin";
    const isSupplier = ctx.user.role === "distributor";
    if (!isAdmin && !isSupplier) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Supplier access required" });
    }
    if (!isAdmin && ctx.user.distributorId == null && ctx.user.approvedVendorLineId == null) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Your account is not linked to an approved vendor record yet. Contact the platform admin.",
      });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        isAdmin,
        distributorId: isSupplier ? ctx.user.distributorId : null,
        approvedVendorLineId: isSupplier ? ctx.user.approvedVendorLineId : null,
      },
    });
  }),
);

// Designer access: a user with role=designer or admin. Designers publish
// availability and manage the consultations booked against their slots.
export const designerProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.user.role !== "designer" && ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Designer access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// CRM staff access: admin, designer, or sales_rep. These are the internal roles
// allowed into the CRM pipeline. (Affiliates/partners are scoped separately in
// the crm router by their affiliate id.)
export const crmStaffProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    const ok = ["admin", "designer", "sales_rep"].includes(ctx.user.role);
    if (!ok) {
      throw new TRPCError({ code: "FORBIDDEN", message: "CRM access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);
