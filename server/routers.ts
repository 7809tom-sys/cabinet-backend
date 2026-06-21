import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  cabinetsRouter,
  distributorsRouter,
  doorStylesRouter,
  pricingRouter,
} from "./routers/catalog";
import { designRouter } from "./routers/design";
import { packagesRouter } from "./routers/packages";
import { prosRouter } from "./routers/pros";
import { ordersRouter } from "./routers/orders";
import { affiliatesRouter } from "./routers/affiliates";
import { storefrontRouter } from "./routers/storefront";
import { crmRouter } from "./routers/crm";
import { locationRouter } from "./routers/location";
import { distributorImportRouter } from "./routers/distributors";
import { distributorPortalRouter } from "./routers/distributorPortal";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Cabinet catalog
  cabinets: cabinetsRouter,
  distributors: distributorsRouter,
  doorStyles: doorStylesRouter,
  pricing: pricingRouter,
  design: designRouter,
  packages: packagesRouter,
  pros: prosRouter,
  orders: ordersRouter,
  affiliates: affiliatesRouter,
  storefront: storefrontRouter,
  crm: crmRouter,
  location: locationRouter,
  distributorAdmin: distributorImportRouter,
  distributorPortal: distributorPortalRouter,
});

export type AppRouter = typeof appRouter;
