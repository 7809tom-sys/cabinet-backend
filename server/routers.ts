import { COOKIE_NAME } from "@shared/const";
import {
  clearLegacyCabinetDealzParentSession,
  getSessionCookieOptions,
} from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  mergeRouters,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import {
  loadAffiliateResolution,
  linkResolvedAffiliateIdentity,
} from "./lib/affiliateAccess";
import {
  resolveSignInDestination,
  shouldLinkAffiliateOnLogin,
  signedInHomeForRole,
} from "@shared/affiliateResolution";
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
import { crmEmailRouter } from "./routers/crmEmail";
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
import { vendorOnboardingRouter } from "./routers/vendorOnboarding";
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
import { affiliateResourcesRouter } from "./routers/affiliateResources";
import { affiliateSocialRouter } from "./routers/affiliateSocialLinks";
import { affiliateGeneratedImagesRouter } from "./routers/affiliateGeneratedImages";
import { hardwareRouter } from "./routers/hardware";
import { stripeInvoicesRouter } from "./routers/stripeInvoices";
import { affiliateCustomersRouter } from "./routers/affiliateCustomers";
import { customerAccountRouter } from "./routers/customerAccount";
import { designAssistRouter } from "./routers/designAssist";
import { shippingQuotesRouter } from "./routers/shippingQuotes";
import { salesForecastRouter } from "./routers/salesForecast";
import { vendorInventoryRouter } from "./routers/vendorInventory";
import { vendorSamplesRouter } from "./routers/vendorSamples";
import { vendorReferralsRouter } from "./routers/vendorReferrals";
import { crmCleanupRouter } from "./routers/crmCleanup";
import { doorRenderingAuditRouter } from "./routers/doorRenderingAudit";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    // Where to land after a Supabase sign-in. `returnPath` is already
    // validated client-side. Affiliate owners and team members go to their
    // own portal. Admins, and any explicit /admin return, do not.
    signInDestination: protectedProcedure
      .input(z.object({ returnPath: z.string().max(2048).nullable() }))
      .query(async ({ ctx, input }) => {
        const user = ctx.user;
        const returnPath =
          input.returnPath &&
          input.returnPath.startsWith("/") &&
          !input.returnPath.startsWith("//")
            ? input.returnPath
            : signedInHomeForRole(user.role);
        const empty = { access: null, ambiguousAffiliateIds: [], link: null };
        const database = await getDb();
        const resolution = database
          ? await loadAffiliateResolution(database, {
              id: user.id,
              email: user.email ?? null,
            })
          : empty;
        if (
          database &&
          shouldLinkAffiliateOnLogin(user.role, resolution.link)
        ) {
          try {
            await linkResolvedAffiliateIdentity(
              database,
              user.id,
              resolution.link
            );
          } catch (error) {
            console.warn(
              "[Auth] Affiliate identity link skipped",
              error instanceof Error ? error.message : "unknown error"
            );
          }
        }
        return resolveSignInDestination({
          returnPath,
          userRole: user.role,
          resolution,
        });
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
  crm: mergeRouters(crmRouter, crmEmailRouter),
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
  vendorOnboarding: vendorOnboardingRouter,
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
  affiliateResources: affiliateResourcesRouter,
  affiliateSocial: affiliateSocialRouter,
  affiliateGeneratedImages: affiliateGeneratedImagesRouter,
  hardware: hardwareRouter,
  stripeInvoices: stripeInvoicesRouter,
  affiliateCustomers: affiliateCustomersRouter,
  customerAccount: customerAccountRouter,
  designAssist: designAssistRouter,
  shippingQuotes: shippingQuotesRouter,
  salesForecast: salesForecastRouter,
  vendorInventory: vendorInventoryRouter,
  vendorSamples: vendorSamplesRouter,
  vendorReferrals: vendorReferralsRouter,
  crmCleanup: crmCleanupRouter,
  doorRenderingAudit: doorRenderingAuditRouter,
});

export type AppRouter = typeof appRouter;
