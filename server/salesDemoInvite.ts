export type SalesDemoInviteAudience = "sales_representative" | "affiliate_candidate";

export const SALES_DEMO_AFFILIATE_SLUG = "sales-demo";

export const SALES_DEMO_TEAM_ACCESS = {
  role: "salesperson" as const,
  accessCrm: true,
  accessDesigner: true,
  isActive: true,
};

export function isSalesDemoAffiliateTarget(slug: string | null | undefined): boolean {
  return slug?.trim().toLowerCase() === SALES_DEMO_AFFILIATE_SLUG;
}

export function buildSalesDemoInvite(options: {
  recipientName?: string | null;
  audience: SalesDemoInviteAudience;
  origin: string;
}) {
  const name = options.recipientName?.trim() || "there";
  const label = options.audience === "affiliate_candidate" ? "prospective affiliate" : "sales representative";
  const base = options.origin.replace(/\/+$/, "");
  const storefrontUrl = `${base}/store/sales-demo?ref=SALESDEMO`;
  const designerUrl = `${base}/design?affiliate=sales-demo&ref=SALESDEMO`;
  const orderUrl = `${base}/store/sales-demo/order?ref=SALESDEMO`;
  const loginUrl = `${base}/affiliate`;
  const subject = "Your Cabinet Dealz Sales Demo Invitation";
  const text = [
    `Hello ${name},`,
    "",
    `You have been invited as a ${label} to the Cabinet Dealz Sales Demo training environment.`,
    "Use the links below to explore the storefront, kitchen designer, order walkthrough, and training CRM.",
    "",
    `Storefront: ${storefrontUrl}`,
    `Designer: ${designerUrl}`,
    `Order walkthrough: ${orderUrl}`,
    `Training CRM: ${loginUrl}`,
    "",
    "Please sign in with this email address to access the training CRM. Your access is limited to Sales Demo and does not include First Class or other live affiliate records.",
  ].join("\n");
  const html = `<p>Hello ${name},</p><p>You have been invited as a ${label} to the <strong>Cabinet Dealz Sales Demo</strong> training environment.</p><p><a href="${storefrontUrl}">Open the storefront</a> · <a href="${designerUrl}">Open the designer</a> · <a href="${orderUrl}">Open the order walkthrough</a> · <a href="${loginUrl}">Open the training CRM</a></p><p>Please sign in with this email address to access the training CRM. Your access is limited to Sales Demo and does not include First Class or other live affiliate records.</p>`;
  return { subject, text, html, storefrontUrl, designerUrl, orderUrl, loginUrl };
}

export async function deliverInviteThenGrant(options: {
  deliver: () => Promise<{ success: boolean; error?: string }>;
  grant: () => Promise<void>;
}) {
  const delivery = await options.deliver();
  if (!delivery.success) return delivery;
  await options.grant();
  return delivery;
}
