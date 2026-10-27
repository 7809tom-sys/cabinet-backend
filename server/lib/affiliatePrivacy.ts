import type { Affiliate } from "../../drizzle/schema";
import { parseSectionLabels, publicContactForStorefront } from "@shared/affiliateStorefrontControls";
import { publicSocialLinks } from "@shared/affiliateSocialLinks";
import type { AffiliateAccess } from "./affiliateAccess";
import { maskW9TaxId, w9TaxIdLast4 } from "./w9TaxIdCrypto";

/** Account secrets that must never appear on a public storefront response. */
export const PUBLIC_STOREFRONT_OMITTED_FIELDS = ["w9TaxId", "notes", "setupToken"] as const;

export function toPublicStorefront(a: Affiliate) {
  const contact = publicContactForStorefront(a);
  return {
    id: a.id,
    storeName: a.storeName,
    slug: a.slug,
    contactName: a.contactName,
    // Account email and phone are never public. Opt-in fields below are the
    // only customer-facing contact details.
    email: null,
    phone: null,
    website: a.website,
    location: null,
    referralCode: a.referralCode,
    status: a.status,
    logoUrl: a.logoUrl,
    logoDarkUrl: a.logoDarkUrl,
    faviconUrl: a.faviconUrl,
    primaryColor: a.primaryColor,
    accentColor: a.accentColor,
    backgroundColor: a.backgroundColor,
    textColor: a.textColor,
    publicEmail: contact.email,
    publicPhone: contact.phone,
    publicAddress: contact.address,
    showPublicEmail: a.showPublicEmail,
    showPublicPhone: a.showPublicPhone,
    showPublicAddress: a.showPublicAddress,
    heroImageUrl: a.heroImageUrl,
    tagline: a.tagline,
    taglineEs: a.taglineEs,
    aboutText: a.aboutText,
    aboutTextEs: a.aboutTextEs,
    footerText: a.footerText,
    serviceArea: a.serviceArea,
    yearsInBusiness: a.yearsInBusiness,
    facebookUrl: a.facebookUrl,
    instagramUrl: a.instagramUrl,
    socialLinks: publicSocialLinks(a.socialLinks, { facebookUrl: a.facebookUrl, instagramUrl: a.instagramUrl }),
    hidePlatformBranding: a.hidePlatformBranding,
    sectionLabels: parseSectionLabels(a.sectionLabelsJson),
    storefrontEnabled: a.storefrontEnabled,
    template: a.template,
    fontFamily: a.fontFamily,
    headingFont: a.headingFont,
    buttonRadius: a.buttonRadius,
    embedCode: a.embedEnabled ? a.embedCode : null,
    embedEnabled: a.embedEnabled,
  };
}

function taxDisplay(row: Affiliate, include: boolean) {
  const last4 = include ? w9TaxIdLast4(row.w9TaxId, row.w9TaxIdLast4) : null;
  return {
    w9TaxIdLast4: last4,
    w9TaxIdMasked: include ? maskW9TaxId(last4) : null,
    hasW9IdDocument: include ? Boolean(row.w9IdDocumentUrl) : false,
  };
}

/**
 * Partner/team view of an affiliate. The full tax ID, setup token, internal
 * notes, and government-ID location are never included. Team members also do
 * not receive the owner's login email, private phone, or contact name.
 */
export function toViewerAffiliate(row: Affiliate, access: Pick<AffiliateAccess, "isOwner" | "accessCrm" | "accessDesigner">) {
  const owner = access.isOwner;
  return {
    id: row.id,
    storeName: row.storeName,
    slug: row.slug,
    contactName: owner ? row.contactName : null,
    email: owner ? row.email : null,
    phone: owner ? row.phone : null,
    website: row.website,
    location: row.location,
    referralCode: row.referralCode,
    status: row.status,
    userId: owner ? row.userId : null,
    logoUrl: row.logoUrl,
    watermarkEnabled: row.watermarkEnabled,
    watermarkPosition: row.watermarkPosition,
    watermarkOpacityBps: row.watermarkOpacityBps,
    primaryColor: row.primaryColor,
    accentColor: row.accentColor,
    publicEmail: row.publicEmail,
    publicPhone: row.publicPhone,
    publicAddress: row.publicAddress,
    heroImageUrl: row.heroImageUrl,
    fontFamily: row.fontFamily,
    headingFont: row.headingFont,
    buttonRadius: row.buttonRadius,
    embedCodeDraft: owner || access.accessDesigner ? row.embedCodeDraft : null,
    embedCode: row.embedEnabled ? row.embedCode : null,
    embedEnabled: row.embedEnabled,
    tagline: row.tagline,
    taglineEs: row.taglineEs,
    aboutText: row.aboutText,
    aboutTextEs: row.aboutTextEs,
    serviceArea: row.serviceArea,
    yearsInBusiness: row.yearsInBusiness,
    facebookUrl: row.facebookUrl,
    instagramUrl: row.instagramUrl,
    storefrontEnabled: row.storefrontEnabled,
    template: row.template,
    defaultMarkupBps: row.defaultMarkupBps,
    hardwareMarkupBps: row.hardwareMarkupBps,
    categoryMarkupJson: owner ? row.categoryMarkupJson : null,
    membershipStatus: row.membershipStatus,
    membershipFeeCents: owner ? row.membershipFeeCents : null,
    membershipPaidAt: owner ? row.membershipPaidAt : null,
    membershipExpiresAt: owner ? row.membershipExpiresAt : null,
    w9Status: owner ? row.w9Status : null,
    w9LegalName: owner ? row.w9LegalName : null,
    w9BusinessName: owner ? row.w9BusinessName : null,
    w9EntityType: owner ? row.w9EntityType : null,
    w9TaxIdType: owner ? row.w9TaxIdType : null,
    w9Address: owner ? row.w9Address : null,
    w9City: owner ? row.w9City : null,
    w9State: owner ? row.w9State : null,
    w9Zip: owner ? row.w9Zip : null,
    w9SubmittedAt: owner ? row.w9SubmittedAt : null,
    w9VerifiedAt: owner ? row.w9VerifiedAt : null,
    commissionRate: owner ? row.commissionRate : null,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    isOwner: owner,
    accessCrm: access.accessCrm,
    accessDesigner: access.accessDesigner,
    ...taxDisplay(row, owner),
  };
}

/** Admin list/detail. Operational fields stay; the full tax ID and raw ID URL do not. */
export function toAdminAffiliate(row: Affiliate) {
  const last4 = w9TaxIdLast4(row.w9TaxId, row.w9TaxIdLast4);
  const { w9TaxId: _tax, setupToken, w9IdDocumentUrl, ...rest } = row;
  return {
    ...rest,
    setupToken: null,
    hasSetupToken: Boolean(setupToken),
    w9TaxId: null,
    w9IdDocumentUrl: null,
    w9TaxIdLast4: last4,
    w9TaxIdMasked: maskW9TaxId(last4),
    hasW9IdDocument: Boolean(w9IdDocumentUrl),
  };
}
