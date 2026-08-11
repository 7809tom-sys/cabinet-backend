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
import { emailAuthRouter } from "./routers/emailAuth";
import { freightRouter } from "./routers/freight";
import { pantryRouter } from "./routers/pantry";
import { paymentsRouter } from "./routers/payments";
import { consultationsRouter } from "./routers/consultations";
import { affiliateMembershipRouter } from "./routers/affiliateMembership";
import { siteSettingsRouter } from "./routers/siteSettings";
import { skuAdminRouter } from "./routers/skuAdmin";
import { genericCabinetsRouter } from "./routers/genericCabinets";
import { cabinetOverridesRouter } from "./routers/cabinetOverrides";
import { emailSettingsRouter } from "./routers/emailSettings";
import { pelicanRouter } from "./routers/pelican";
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
  emailAuth: emailAuthRouter,
  freight: freightRouter,
  pantry: pantryRouter,
  payments: paymentsRouter,
  consultations: consultationsRouter,
  affiliateMembership: affiliateMembershipRouter,
  siteSettings: siteSettingsRouter,
  skuAdmin: skuAdminRouter,
  genericCabinets: genericCabinetsRouter,
  cabinetOverrides: cabinetOverridesRouter,
  emailSettings: emailSettingsRouter,
  pelican: pelicanRouter,
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
});

export type AppRouter = typeof appRouter;
