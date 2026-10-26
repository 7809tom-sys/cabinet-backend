import { COOKIE_NAME } from "@shared/const";
import { clearLegacyCabinetDealzParentSession, getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { affiliates } from "../drizzle/schema";
import { resolveAffiliateAdministrationDestination } from "./oauthAffiliateDestination";
import {
  cabinetsRouter,
  distributorsRouter,
  doorStylesRouter,
  pricingRouter,
} from "./routers/catalog";
import { designRouter } from "./routers/design";
import { designMissingPriceRouter } from "./routers/designMissingPrice";
import { prosRouter } from "./routers/pros";
import { vendorRouter } from "./routers/vendor";
import { ordersRouter } from "./routers/orders";
import { affiliatesRouter } from "./routers/affiliates";
import { storefrontRouter } from "./routers/storefront";
import { crmRouter } from "./routers/crm";
import { locationRouter } from "./routers/location";
import { distributorImportRouter } from "./routers/distributors";
import { distributorPortalRouter } from "./routers/distributorPortal";
import { customersRouter } from "./routers/customers";
import { ocrRouter } from "./routers/ocr";
import { assistantRouter } from "./routers/assistant";
import { skuImagesRouter } from "./routers/skuImages";
import { freightRouter } from "./routers/freight";
import { pantryRouter } from "./routers/pantry";
import { paymentsRouter } from "./routers/payments";
import { consultationsRouter } from "./routers/consultations";
import { affiliateMembershipRouter } from "./routers/affiliateMembership";
import { siteSettingsRouter } from "./routers/siteSettings";
import { skuAdminRouter } from "./routers/skuAdmin";
import { genericCabinetsRouter } from "./routers/genericCabinets";
import { cabinetOverridesRouter } from "./routers/cabinetOverrides";
import { masterChangesRouter } from "./routers/masterChanges";
import { cabinetRecoveryRouter } from "./routers/cabinetRecovery";
import { emailSettingsRouter } from "./routers/emailSettings";
import { pelicanRouter } from "./routers/pelican";
import { vendorFulfillmentRouter } from "./routers/vendorFulfillment";
import { vendorCodeUploadRouter } from "./routers/vendorCodeUpload";
import { vendorsRouter } from "./routers/vendors";
import { surfacesRouter } from "./routers/surfaces";
import { promotionsRouter } from "./routers/promotions";
import { galleryRouter } from "./routers/gallery";
import { analyticsRouter } from "./routers/analytics";
import { fixturePhotoRouter } from "./routers/fixturePhoto";
import { priceShopRouter } from "./routers/priceShop";
import { qboRouter } from "./routers/qbo";
import { pageContentRouter } from "./routers/pageContent";
import { measureSessionsRouter } from "./routers/measureSessions";
import { mediaLibraryRouter } from "./routers/mediaLibrary";
import { bannersRouter } from "./routers/banners";
import { masterSkuRouter } from "./routers/masterSku";
import { cabinetCategoriesRouter } from "./routers/cabinetCategories";
import { cabinet3dPreviewRouter } from "./routers/cabinet3dPreview";
import { catalogImportRouter } from "./routers/catalogImport";
import { installationEstimatesRouter } from "./routers/installationEstimates";
import { roomLayoutsRouter } from "./routers/roomLayouts";
import { favoritesRouter } from "./routers/favorites";
import { preferredProductsRouter } from "./routers/preferredProducts";
import { designPhotoRendersRouter } from "./routers/designPhotoRenders";
import { generatedDesignImagesRouter } from "./routers/generatedDesignImages";
import { adminStickyNotesRouter } from "./routers/adminStickyNotes";
import { operationsProvidersRouter } from "./routers/operationsProviders";
import { affiliateLiteratureRouter } from "./routers/affiliateLiterature";
import { affiliateGeneratedImagesRouter } from "./routers/affiliateGeneratedImages";
import { hardwareRouter } from "./routers/hardware";
import { stripeInvoicesRouter } from "./routers/stripeInvoices";
import { shippingQuotesRouter } from "./routers/shippingQuotes";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    // Where to land after a Supabase sign-in. `returnPath` is already
    // validated client-side; active affiliate owners still go to their own
    // Affiliate Administration, as the old OAuth callback did.
    signInDestination: protectedProcedure
      .input(z.object({ returnPath: z.string().max(2048).nullable() }))
      .query(async ({ ctx, input }) => {
        const user = ctx.user;
        const roleDefault =
          user.role === "distributor" ? "/vendor" : user.role === "admin" ? "/admin" : "/account";
        const returnPath =
          input.returnPath && input.returnPath.startsWith("/") && !input.returnPath.startsWith("//")
            ? input.returnPath
            : roleDefault;
        const database = await getDb();
        if (!database) return { destination: returnPath };
        const affiliateRows = await database.select().from(affiliates);
        const affiliateDestination = resolveAffiliateAdministrationDestination({
          returnPath,
          userId: user.id,
          email: user.email,
          userRole: user.role,
          affiliates: affiliateRows,
        });
        return { destination: affiliateDestination ?? returnPath };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      clearLegacyCabinetDealzParentSession(ctx.req, ctx.res);
      return { success: true } as const;
    }),
  }),

  // Cabinet catalog
  cabinets: cabinetsRouter,
  distributors: distributorsRouter,
  doorStyles: doorStylesRouter,
  pricing: pricingRouter,
  design: designRouter,
  designMissingPrice: designMissingPriceRouter,
  pros: prosRouter,
  vendor: vendorRouter,
  orders: ordersRouter,
  affiliates: affiliatesRouter,
  storefront: storefrontRouter,
  crm: crmRouter,
  location: locationRouter,
  distributorAdmin: distributorImportRouter,
  distributorPortal: distributorPortalRouter,
  customers: customersRouter,
  ocr: ocrRouter,
  assistant: assistantRouter,
  skuImages: skuImagesRouter,
  freight: freightRouter,
  pantry: pantryRouter,
  payments: paymentsRouter,
  consultations: consultationsRouter,
  affiliateMembership: affiliateMembershipRouter,
  siteSettings: siteSettingsRouter,
  skuAdmin: skuAdminRouter,
  genericCabinets: genericCabinetsRouter,
  cabinetOverrides: cabinetOverridesRouter,
  masterChanges: masterChangesRouter,
  cabinetRecovery: cabinetRecoveryRouter,
  emailSettings: emailSettingsRouter,
  pelican: pelicanRouter,
  vendorFulfillment: vendorFulfillmentRouter,
  vendorCodeUpload: vendorCodeUploadRouter,
  vendors: vendorsRouter,
  surfaces: surfacesRouter,
  promotions: promotionsRouter,
  gallery: galleryRouter,
  analytics: analyticsRouter,
  fixturePhoto: fixturePhotoRouter,
  priceShop: priceShopRouter,
  qbo: qboRouter,
  pageContent: pageContentRouter,
  measureSessions: measureSessionsRouter,
  mediaLibrary: mediaLibraryRouter,
  banners: bannersRouter,
  masterSku: masterSkuRouter,
  cabinetCategories: cabinetCategoriesRouter,
  cabinet3dPreview: cabinet3dPreviewRouter,
  catalogImport: catalogImportRouter,
  installationEstimates: installationEstimatesRouter,
  roomLayouts: roomLayoutsRouter,
  favorites: favoritesRouter,
  preferredProducts: preferredProductsRouter,
  designPhotoRenders: designPhotoRendersRouter,
  generatedDesignImages: generatedDesignImagesRouter,
  adminStickyNotes: adminStickyNotesRouter,
  operationsProviders: operationsProvidersRouter,
  affiliateLiterature: affiliateLiteratureRouter,
  affiliateGeneratedImages: affiliateGeneratedImagesRouter,
  hardware: hardwareRouter,
  stripeInvoices: stripeInvoicesRouter,
  shippingQuotes: shippingQuotesRouter,
});

export type AppRouter = typeof appRouter;
