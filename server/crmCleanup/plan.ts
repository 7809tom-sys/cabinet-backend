/**
 * Pure CRM cleanup planner. It never opens a database connection.
 * Preview and confirm both call this with a dataset loaded inside the server
 * (or with fixtures in tests) and then compare snapshot hashes.
 */

export const MAX_AUTHORIZED_KEEP = 9;

export const DELETE_REASONS = [
  "design_example",
  "example_email",
  "test_fake_name",
  "bulk_seeded",
  "no_real_activity",
  "fake_order",
  "removed_from_keep",
] as const;

export type DeleteReason = (typeof DELETE_REASONS)[number];

export type KeepReason =
  | "named_tom"
  | "named_seliena"
  | "named_rich"
  | "named_marcus"
  | "named_ron"
  | "named_m2"
  | "suggested_authorized"
  | "forced_actor"
  | "forced_last_admin"
  | "manual_keep"
  | "unflagged"
  | "kept_with_user"
  | "kept_child";

export type PlanReason = DeleteReason | KeepReason;

export const REASON_LABELS: Record<string, string> = {
  design_example: "design example",
  example_email: "example.com email",
  test_fake_name: "test/fake name",
  bulk_seeded: "bulk-seeded pattern",
  no_real_activity: "no real activity",
  fake_order: "fake order",
  removed_from_keep: "removed from keep list",
  named_tom: "Tom (owner/admin)",
  named_seliena: "Seliena Bilodeau",
  named_rich: "Rich (richnseliena)",
  named_marcus: "Marcus Reeves",
  named_ron: "Ron White",
  named_m2: "M 2",
  suggested_authorized: "suggested authorized account",
  forced_actor: "signed-in admin",
  forced_last_admin: "last admin",
  manual_keep: "added to keep list",
  unflagged: "no delete reason",
  kept_with_user: "belongs to a kept user",
  kept_child: "child of a kept record",
};

export class CleanupPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CleanupPlanError";
  }
}

export type LinkKind = "user" | "order" | "deal" | "design" | "legacyOrder";

export type PlannerUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: string;
  pricingTier: string;
  companyName: string | null;
  authId: string | null;
  createdAt: string;
  updatedAt: string;
  lastSignedIn: string | null;
  authoredActivityCount?: number;
};

export type PlannerOrder = {
  id: number;
  userId: number | null;
  requestNumber: string;
  originatorName: string | null;
  originatorEmail: string | null;
  status: string;
  notes: string | null;
  paidAt: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Approved/paid gateway row already joined by the loader. */
  paymentApproved?: boolean;
  /** Paid/refunded Stripe ledger row already joined by the loader. */
  hasStripeRecord?: boolean;
};

export type PlannerLegacyOrder = {
  id: number;
  userId: number | null;
  orderNumber: string;
  paymentStatus: string | null;
  paidAt: string | null;
  stripePaymentIntentId: string | null;
  updatedAt: string;
};

export type PlannerDeal = {
  id: number;
  title: string;
  contactName: string | null;
  contactEmail: string | null;
  ownerUserId: number | null;
  affiliateId: number | null;
  orderRequestId: number | null;
  notes: string | null;
  stage: string;
  createdAt: string;
  updatedAt: string;
  activityCount: number;
  laborEstimateId?: number | null;
};

export type PlannerAffiliate = {
  id: number;
  userId: number | null;
  contactName: string | null;
  email: string;
  storeName: string;
  status: string;
  updatedAt: string;
};

export type PlannerStripe = {
  id: number;
  orderRequestId: number | null;
  customerEmail: string | null;
  customerName: string | null;
  purpose: string;
  affiliateId: number | null;
  status: string;
  updatedAt: string;
};

export type PlannerEstimate = {
  id: number;
  /** Null for a contractor-owned estimate. Affiliate rows still set this. */
  affiliateId: number | null;
  orderRequestId: number | null;
  kitchenDesignId: number | null;
  crmDealId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  updatedAt: string;
};

export type PlannerChild = {
  table: string;
  id: number;
  updatedAt: string;
  links: { kind: LinkKind; id: number }[];
  /**
   * "any" deletes the row when any linked parent is deleted.
   * "user_only" deletes only when a linked user is deleted (kept people's
   * consultations and similar rows survive a deleted deal).
   */
  mode?: "any" | "user_only";
};

export type PlannerUnlink = {
  table: string;
  id: number;
  field: string;
  updatedAt: string;
};

export type BuildPlanInput = {
  actorUserId: number;
  /** When omitted, the planner chooses the authorized keep list. */
  keepUserIds?: number[];
  alsoDeleteUserIds?: number[];
  deleteSupabaseAuth?: boolean;
  ownerEmail?: string | null;
  ownerOpenId?: string | null;
  users: PlannerUser[];
  orderRequests: PlannerOrder[];
  legacyOrders?: PlannerLegacyOrder[];
  deals: PlannerDeal[];
  affiliates: PlannerAffiliate[];
  teamMemberUserIds?: number[];
  stripeRecords?: PlannerStripe[];
  estimates?: PlannerEstimate[];
  children?: PlannerChild[];
  globalAliases?: { id: number; createdByUserId: number | null; updatedAt: string }[];
};

export type PlannedUser = PlannerUser & {
  action: "delete" | "keep";
  reason: PlanReason;
  hasRealPayment: boolean;
  forced: boolean;
  namedKey: string | null;
};

export type PlannedOrder = PlannerOrder & {
  action: "delete" | "keep";
  reason: PlanReason;
  hasRealPayment: boolean;
};

export type PlannedDeal = PlannerDeal & {
  action: "delete" | "keep";
  reason: PlanReason;
  hasRealPayment: boolean;
};

export type PlannedChild = {
  table: string;
  id: number;
  updatedAt: string;
  action: "delete" | "keep";
  reason: PlanReason;
  hasRealPayment: boolean;
};

export type CleanupPlan = {
  deleteSupabaseAuth: boolean;
  explicitKeep: boolean;
  keepUserIds: number[];
  alsoDeleteUserIds: number[];
  forcedUserIds: number[];
  users: PlannedUser[];
  orderRequests: PlannedOrder[];
  legacyOrders: (PlannerLegacyOrder & { action: "delete" | "keep"; reason: PlanReason; hasRealPayment: boolean })[];
  deals: PlannedDeal[];
  children: PlannedChild[];
  stripeRecords: (PlannerStripe & { action: "delete" | "keep"; reason: PlanReason; hasRealPayment: boolean })[];
  estimates: (PlannerEstimate & { action: "delete" | "keep"; reason: PlanReason; hasRealPayment: boolean })[];
  unlinks: PlannerUnlink[];
  preservedAffiliates: PlannerAffiliate[];
  unlinkedAffiliates: PlannerAffiliate[];
  warnings: string[];
};

const EXAMPLE_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "example.invalid",
  "test.com",
  "mailinator.com",
  "guerrillamail.com",
  "yopmail.com",
  "tempmail.com",
  "trashmail.com",
  "10minutemail.com",
  "sharklasers.com",
  "discard.email",
  "fakeinbox.com",
  "mailnull.com",
]);

const STAFF_ROLES = new Set(["admin", "designer", "partner", "distributor", "dealer", "sales_rep"]);

const FAKE_WORD = /\b(test|fake|dummy|sample|demo|asdf|qwerty|lorem|xxx+|foobar|foo|baz)\b/i;
const PLACEHOLDER_NAME = /^(john|jane)\s+doe$/i;
const NUMBERED_NAME = /^(user|customer|homeowner|client|buyer|member|testuser|seed)\s*#?\d+$/i;
const FAKE_LOCAL = /^(test|fake|dummy|demo|sample|asdf|qwerty|fakeuser|testuser)\d*$/i;

export function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function compact(value: string | null | undefined): string {
  return norm(value).replace(/[^a-z0-9]/g, "");
}

function emailLocal(email: string | null | undefined): string {
  const local = norm(email).split("@")[0] ?? "";
  return local.replace(/[^a-z0-9]/g, "");
}

function emailDomain(email: string | null | undefined): string {
  const parts = norm(email).split("@");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export function isExampleEmail(email: string | null | undefined): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (domain.endsWith(".invalid") || domain === "invalid") return true;
  return EXAMPLE_DOMAINS.has(domain);
}

export function isTestFakeName(name: string | null | undefined, email?: string | null): boolean {
  const n = norm(name);
  if (n && (FAKE_WORD.test(n) || PLACEHOLDER_NAME.test(n))) return true;
  const local = emailLocal(email);
  return Boolean(local && FAKE_LOCAL.test(local));
}

export function isBulkSeededIdentity(parts: {
  name?: string | null;
  email?: string | null;
  openId?: string | null;
  requestNumber?: string | null;
  notes?: string | null;
}): boolean {
  const email = norm(parts.email);
  const name = norm(parts.name);
  const openId = norm(parts.openId);
  const requestNumber = parts.requestNumber ?? "";
  const notes = norm(parts.notes);
  if (email && /\+(seed|test|bulk|load)\b/.test(email)) return true;
  if (email && /^(seed|bulk|loadtest|import|generated)[-_]?\d*@/.test(email)) return true;
  if (email && /^(user|customer|homeowner|client)\d{2,}@/.test(email)) return true;
  if (openId && /^(seed|bulk|loadtest|testuser|fakeuser)[-_]/.test(openId)) return true;
  if (name && /^(seed|bulk|generated|import)\b/.test(name)) return true;
  if (name && NUMBERED_NAME.test(name)) return true;
  if (/^(test|seed|fake|demo|bulk)[-_]/i.test(requestNumber)) return true;
  if (notes && /\b(seeded|bulk seed|test order|fake order)\b/.test(notes)) return true;
  return false;
}

/** Mike James, including the CabinetDealz Yahoo design-example mailbox. */
export function isDesignExampleIdentity(name: string | null | undefined, email?: string | null): boolean {
  const n = norm(name);
  const e = norm(email);
  const compactName = compact(n);
  const local = emailLocal(e);
  const domain = emailDomain(e);
  const yahoo = domain === "yahoo.com" || domain === "ymail.com" || domain === "yahoo.co.uk";
  const mike = compactName === "mikejames" || /^mike\s+james$/.test(n) || local === "mikejames" || local.includes("mikejames");
  if (yahoo && (local.includes("cabinetdealz") || e.includes("cabinetdealz"))) return true;
  if (mike && (yahoo || n.includes("cabinetdealz") || e.includes("cabinetdealz"))) return true;
  if (/^mike\s+james$/.test(n) || compactName === "mikejames") return true;
  return false;
}

function isM2Identity(user: Pick<PlannerUser, "name" | "email" | "openId">): boolean {
  const name = norm(user.name);
  if (name === "m 2" || name === "m2" || name === "m-2" || /^m[\s._-]*2$/.test(name)) return true;
  if (compact(user.name) === "m2" && name.length <= 4) return true;
  if (emailLocal(user.email) === "m2") return true;
  if (compact(user.openId) === "m2") return true;
  return false;
}

function isRichIdentity(user: Pick<PlannerUser, "name" | "email" | "openId" | "companyName">): boolean {
  const blob = compact(`${user.name ?? ""} ${user.email ?? ""} ${user.openId ?? ""} ${user.companyName ?? ""}`);
  if (blob.includes("richnseliena") || blob.includes("richandseliena") || blob.includes("richnselena")) return true;
  const name = norm(user.name);
  return (name === "rich" || name.startsWith("rich ")) && blob.includes("seliena");
}

function isSelienaIdentity(user: Pick<PlannerUser, "name" | "email" | "openId">): boolean {
  const name = norm(user.name);
  const blob = compact(`${name} ${user.email ?? ""} ${user.openId ?? ""}`);
  if (/selie?na\s+bilodeau/.test(name)) return true;
  return blob.includes("selienabilodeau") || blob.includes("selenabilodeau");
}

function isRonIdentity(user: Pick<PlannerUser, "name" | "email" | "openId">): boolean {
  const name = norm(user.name);
  if (/^(ron|ronald)\s+white$/.test(name)) return true;
  return compact(name) === "ronwhite" || compact(user.openId) === "ronwhite" || emailLocal(user.email) === "ronwhite";
}

function isMarcusIdentity(user: PlannerUser, affiliates: PlannerAffiliate[]): boolean {
  const name = norm(user.name);
  if (/^marcus\s+reeves$/.test(name) || compact(name) === "marcusreeves") return true;
  if (emailLocal(user.email) === "marcusreeves" || compact(user.openId) === "marcusreeves") return true;
  return affiliates.some(
    (affiliate) =>
      affiliate.userId === user.id &&
      (/^marcus\s+reeves$/.test(norm(affiliate.contactName)) || compact(affiliate.contactName) === "marcusreeves"),
  );
}

function isTomIdentity(
  user: PlannerUser,
  owner: { ownerEmail?: string | null; ownerOpenId?: string | null },
): boolean {
  const ownerEmail = norm(owner.ownerEmail);
  const ownerOpenId = (owner.ownerOpenId ?? "").trim();
  if (ownerEmail && norm(user.email) === ownerEmail) return true;
  if (ownerOpenId && user.openId === ownerOpenId) return true;
  if (user.role !== "admin") return false;
  if (isTestFakeName(user.name, user.email)) return false;
  const name = norm(user.name);
  if (/^(tom|thomas)(\s|$)/.test(name)) return true;
  const local = emailLocal(user.email);
  if (local === "tom" || local === "thomas") return true;
  const handle = compact(user.openId);
  return handle === "tom" || handle === "thomas";
}

type NamedKey = "named_tom" | "named_seliena" | "named_rich" | "named_marcus" | "named_ron" | "named_m2";

function namedKey(
  user: PlannerUser,
  affiliates: PlannerAffiliate[],
  owner: { ownerEmail?: string | null; ownerOpenId?: string | null },
): NamedKey | null {
  if (isTomIdentity(user, owner)) return "named_tom";
  if (isSelienaIdentity(user)) return "named_seliena";
  if (isRichIdentity(user)) return "named_rich";
  if (isMarcusIdentity(user, affiliates)) return "named_marcus";
  if (isRonIdentity(user)) return "named_ron";
  if (isM2Identity(user)) return "named_m2";
  return null;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function signedInOnALaterDay(user: PlannerUser): boolean {
  const created = parseTime(user.createdAt);
  const seen = parseTime(user.lastSignedIn);
  if (created == null || seen == null) return false;
  return seen - created > 24 * 60 * 60 * 1000;
}

function barelySignedIn(user: PlannerUser): boolean {
  const created = parseTime(user.createdAt);
  const seen = parseTime(user.lastSignedIn);
  if (created == null || seen == null) return true;
  return Math.abs(seen - created) <= 60 * 60 * 1000;
}

export function orderHasRealPayment(order: PlannerOrder): boolean {
  return Boolean(
    order.paidAt ||
      order.stripePaymentIntentId ||
      order.stripeSessionId ||
      order.paymentApproved ||
      order.hasStripeRecord,
  );
}

function legacyHasRealPayment(order: PlannerLegacyOrder): boolean {
  return Boolean(order.paidAt || order.stripePaymentIntentId || order.paymentStatus === "paid");
}

function stripeIsReal(record: PlannerStripe): boolean {
  return record.status === "paid" || record.status === "refunded" || record.status === "partially_refunded";
}

function contentDeleteReason(name: string | null | undefined, email?: string | null, extra?: {
  openId?: string | null;
  requestNumber?: string | null;
  notes?: string | null;
}): DeleteReason | null {
  if (isDesignExampleIdentity(name, email)) return "design_example";
  if (isExampleEmail(email)) return "example_email";
  if (isTestFakeName(name, email)) return "test_fake_name";
  if (isBulkSeededIdentity({ name, email, ...extra })) return "bulk_seeded";
  return null;
}

function childParentDeleted(
  child: PlannerChild,
  deleted: { user: Set<number>; order: Set<number>; deal: Set<number>; design: Set<number>; legacyOrder: Set<number> },
): boolean {
  const hit = (kind: LinkKind, id: number) => {
    if (kind === "user") return deleted.user.has(id);
    if (kind === "order") return deleted.order.has(id);
    if (kind === "deal") return deleted.deal.has(id);
    if (kind === "design") return deleted.design.has(id);
    return deleted.legacyOrder.has(id);
  };
  if (child.mode === "user_only") {
    const userLinks = child.links.filter((link) => link.kind === "user");
    if (userLinks.length === 0) return child.links.some((link) => hit(link.kind, link.id));
    return userLinks.some((link) => deleted.user.has(link.id));
  }
  return child.links.some((link) => hit(link.kind, link.id));
}

function reasonForDeletedParent(
  child: PlannerChild,
  users: Map<number, PlannedUser>,
  orders: Map<number, PlannedOrder>,
  deals: Map<number, PlannedDeal>,
): PlanReason {
  for (const link of child.links) {
    if (link.kind === "user" && users.get(link.id)?.action === "delete") return users.get(link.id)!.reason;
    if (link.kind === "order" && orders.get(link.id)?.action === "delete") return orders.get(link.id)!.reason;
    if (link.kind === "deal" && deals.get(link.id)?.action === "delete") return deals.get(link.id)!.reason;
  }
  return "fake_order";
}

export function buildCleanupPlan(input: BuildPlanInput): CleanupPlan {
  const warnings: string[] = [];
  const affiliates = input.affiliates;
  const affiliateUserIds = new Set(affiliates.map((affiliate) => affiliate.userId).filter((id): id is number => id != null));
  const teamMemberUserIds = new Set(input.teamMemberUserIds ?? []);
  const owner = { ownerEmail: input.ownerEmail, ownerOpenId: input.ownerOpenId };
  const explicitKeep = input.keepUserIds != null;
  const requestedKeep = new Set(input.keepUserIds ?? []);
  const requestedDelete = new Set(input.alsoDeleteUserIds ?? []);

  const knownIds = new Set(input.users.map((user) => user.id));
  for (const id of Array.from(requestedKeep)) {
    if (!knownIds.has(id)) warnings.push(`Keep list user id ${id} was not found.`);
  }
  for (const id of Array.from(requestedDelete)) {
    if (!knownIds.has(id)) warnings.push(`Delete list user id ${id} was not found.`);
  }

  const named = new Map<number, NamedKey>();
  for (const user of input.users) {
    const key = namedKey(user, affiliates, owner);
    if (key) named.set(user.id, key);
  }

  const forced = new Set<number>();
  if (knownIds.has(input.actorUserId)) forced.add(input.actorUserId);
  const admins = input.users.filter((user) => user.role === "admin");
  if (admins.length === 1) forced.add(admins[0]!.id);

  const designIdsByUser = new Map<number, number>();
  for (const child of input.children ?? []) {
    if (child.table !== "kitchen_designs") continue;
    for (const link of child.links) {
      if (link.kind === "user") designIdsByUser.set(link.id, (designIdsByUser.get(link.id) ?? 0) + 1);
    }
  }

  const ordersByUser = new Map<number, PlannerOrder[]>();
  for (const order of input.orderRequests) {
    if (order.userId == null) continue;
    const list = ordersByUser.get(order.userId) ?? [];
    list.push(order);
    ordersByUser.set(order.userId, list);
  }

  function userHasRealPayment(user: PlannerUser): boolean {
    if ((ordersByUser.get(user.id) ?? []).some(orderHasRealPayment)) return true;
    if ((input.legacyOrders ?? []).some((order) => order.userId === user.id && legacyHasRealPayment(order))) return true;
    const email = norm(user.email);
    if (!email) return false;
    return (input.stripeRecords ?? []).some(
      (record) => stripeIsReal(record) && norm(record.customerEmail) === email,
    );
  }

  function genuinelyAuthorized(user: PlannerUser): boolean {
    if (named.has(user.id)) return false;
    if (isDesignExampleIdentity(user.name, user.email)) return false;
    if (isExampleEmail(user.email) || isTestFakeName(user.name, user.email) || isBulkSeededIdentity(user)) return false;
    const realEmail = Boolean(user.email && user.email.includes("@") && !isExampleEmail(user.email));
    if (!realEmail) return false;
    const staff = STAFF_ROLES.has(user.role);
    const affiliateLinked = affiliateUserIds.has(user.id) || teamMemberUserIds.has(user.id);
    if (staff || affiliateLinked) return true;
    const active =
      (designIdsByUser.get(user.id) ?? 0) > 0 ||
      (ordersByUser.get(user.id) ?? []).length > 0 ||
      (user.authoredActivityCount ?? 0) > 0;
    return signedInOnALaterDay(user) && active;
  }

  const suggestionPool = input.users
    .filter((user) => genuinelyAuthorized(user) && !forced.has(user.id))
    .sort((a, b) => {
      const rank = (user: PlannerUser) => {
        if (affiliateUserIds.has(user.id)) return 0;
        if (STAFF_ROLES.has(user.role)) return 1;
        if (userHasRealPayment(user)) return 2;
        return 3;
      };
      return rank(a) - rank(b) || a.id - b.id;
    });

  const autoKeep = new Set<number>(Array.from(named.keys()).concat(Array.from(forced)));
  const suggested = new Set<number>();
  for (const candidate of suggestionPool) {
    if (autoKeep.size >= MAX_AUTHORIZED_KEEP) break;
    autoKeep.add(candidate.id);
    suggested.add(candidate.id);
  }
  if (named.size + forced.size > MAX_AUTHORIZED_KEEP) {
    warnings.push("Named accounts plus protected admins already exceed nine. No further accounts were suggested.");
  }

  let keep = new Set<number>();
  if (!explicitKeep) {
    keep = new Set(autoKeep);
  } else {
    keep = new Set(Array.from(requestedKeep).filter((id) => knownIds.has(id)));
    for (const id of Array.from(forced)) {
      if (!keep.has(id)) {
        warnings.push(`User ${id} was kept because they are the signed-in admin or the last admin.`);
      }
      keep.add(id);
    }
    const optionalKeeps = Array.from(keep).filter((id) => !forced.has(id) && !named.has(id));
    if (keep.size > MAX_AUTHORIZED_KEEP && optionalKeeps.length > 0) {
      throw new CleanupPlanError("Keep list must stay under ten users.");
    }
    if (keep.size > MAX_AUTHORIZED_KEEP) {
      warnings.push("Named accounts plus protected admins already exceed nine. No further accounts were suggested.");
    }
  }
  for (const id of Array.from(requestedDelete)) {
    if (forced.has(id)) {
      warnings.push(`User ${id} was kept because they are the signed-in admin or the last admin.`);
    }
  }

  const deleteUserIds = new Set<number>();
  const users: PlannedUser[] = input.users.map((user) => {
    const hasRealPayment = userHasRealPayment(user);
    const forcedUser = forced.has(user.id);
    const key = named.get(user.id) ?? null;
    let action: "delete" | "keep" = "keep";
    let reason: PlanReason = "unflagged";

    if (keep.has(user.id)) {
      action = "keep";
      if (key) reason = key;
      else if (suggested.has(user.id) && (!explicitKeep || requestedKeep.has(user.id))) reason = "suggested_authorized";
      else if (forcedUser && user.id === input.actorUserId && !key) reason = "forced_actor";
      else if (forcedUser && admins.length === 1) reason = "forced_last_admin";
      else reason = "manual_keep";
    } else if (explicitKeep && autoKeep.has(user.id)) {
      action = "delete";
      reason = "removed_from_keep";
    } else if (requestedDelete.has(user.id)) {
      action = "delete";
      reason = "removed_from_keep";
    } else {
      const content = contentDeleteReason(user.name, user.email, { openId: user.openId });
      const quiet =
        !STAFF_ROLES.has(user.role) &&
        !affiliateUserIds.has(user.id) &&
        !teamMemberUserIds.has(user.id) &&
        !hasRealPayment &&
        (designIdsByUser.get(user.id) ?? 0) === 0 &&
        (ordersByUser.get(user.id) ?? []).length === 0 &&
        (user.authoredActivityCount ?? 0) === 0 &&
        barelySignedIn(user) &&
        (user.role === "user" || user.role === "contractor");
      if (content) {
        action = "delete";
        reason = content;
      } else if (quiet) {
        action = "delete";
        reason = "no_real_activity";
      }
    }

    if (action === "delete" && forcedUser) {
      action = "keep";
      reason = user.id === input.actorUserId ? "forced_actor" : "forced_last_admin";
      warnings.push(`User ${user.id} was kept because they are the signed-in admin or the last admin.`);
    }

    if (action === "delete") deleteUserIds.add(user.id);
    return { ...user, action, reason, hasRealPayment, forced: forcedUser, namedKey: key };
  });

  const survivingAdmins = users.filter((user) => user.role === "admin" && user.action === "keep");
  if (admins.length > 0 && survivingAdmins.length === 0) {
    const rescue = users.find((user) => user.id === input.actorUserId) ?? users.find((user) => user.role === "admin");
    if (rescue) {
      rescue.action = "keep";
      rescue.reason = "forced_last_admin";
      deleteUserIds.delete(rescue.id);
      warnings.push(`User ${rescue.id} was kept so the cleanup cannot remove the last admin.`);
    }
  }

  const userById = new Map(users.map((user) => [user.id, user]));

  const orderRequests: PlannedOrder[] = input.orderRequests.map((order) => {
    const hasRealPayment = orderHasRealPayment(order);
    const ownerUser = order.userId != null ? userById.get(order.userId) : undefined;
    let action: "delete" | "keep" = "keep";
    let reason: PlanReason = "unflagged";
    if (ownerUser?.action === "keep") {
      action = "keep";
      reason = "kept_with_user";
    } else {
      const own = contentDeleteReason(order.originatorName, order.originatorEmail, {
        requestNumber: order.requestNumber,
        notes: order.notes,
      });
      if (ownerUser?.action === "delete") {
        action = "delete";
        reason = own ?? (ownerUser.reason as DeleteReason);
      } else if (own) {
        action = "delete";
        reason = own;
      } else if (
        order.status === "draft" &&
        !hasRealPayment &&
        isBulkSeededIdentity({ notes: order.notes, requestNumber: order.requestNumber, name: order.originatorName, email: order.originatorEmail })
      ) {
        action = "delete";
        reason = "bulk_seeded";
      }
    }
    return { ...order, action, reason, hasRealPayment };
  });

  const legacyOrders = (input.legacyOrders ?? []).map((order) => {
    const hasRealPayment = legacyHasRealPayment(order);
    const ownerUser = order.userId != null ? userById.get(order.userId) : undefined;
    let action: "delete" | "keep" = "keep";
    let reason: PlanReason = "unflagged";
    if (ownerUser?.action === "keep") {
      reason = "kept_with_user";
    } else if (ownerUser?.action === "delete") {
      action = "delete";
      reason = ownerUser.reason;
    } else if (isBulkSeededIdentity({ requestNumber: order.orderNumber })) {
      action = "delete";
      reason = "bulk_seeded";
    }
    return { ...order, action, reason, hasRealPayment };
  });

  const deletedOrderIds = new Set(orderRequests.filter((order) => order.action === "delete").map((order) => order.id));
  const orderById = new Map(orderRequests.map((order) => [order.id, order]));

  const deals: PlannedDeal[] = input.deals.map((deal) => {
    const linkedOrder = deal.orderRequestId != null ? orderById.get(deal.orderRequestId) : undefined;
    const contactUser = users.find((user) => user.email && deal.contactEmail && norm(user.email) === norm(deal.contactEmail));
    const hasRealPayment = Boolean(linkedOrder?.hasRealPayment) || Boolean(contactUser?.hasRealPayment);
    let action: "delete" | "keep" = "keep";
    let reason: PlanReason = "unflagged";
    const own = contentDeleteReason(deal.contactName, deal.contactEmail, { notes: deal.notes });
    if (linkedOrder?.action === "delete") {
      action = "delete";
      reason = own ?? "fake_order";
    } else if (contactUser?.action === "delete") {
      action = "delete";
      reason = own ?? (contactUser.reason as DeleteReason);
    } else if (own) {
      action = "delete";
      reason = own;
    } else if (
      deal.activityCount === 0 &&
      !deal.orderRequestId &&
      !norm(deal.contactName) &&
      !norm(deal.contactEmail) &&
      /^(test|deal|lead|new deal|untitled)\b/.test(norm(deal.title))
    ) {
      action = "delete";
      reason = "no_real_activity";
    }
    return { ...deal, action, reason, hasRealPayment };
  });

  const deletedDealIds = new Set(deals.filter((deal) => deal.action === "delete").map((deal) => deal.id));
  const keptDealIds = new Set(deals.filter((deal) => deal.action === "keep").map((deal) => deal.id));
  const dealById = new Map(deals.map((deal) => [deal.id, deal]));
  const keptLaborIds = new Set(
    deals.filter((deal) => deal.action === "keep" && deal.laborEstimateId != null).map((deal) => deal.laborEstimateId as number),
  );

  const deletedDesignIds = new Set<number>();
  for (const child of input.children ?? []) {
    if (child.table !== "kitchen_designs") continue;
    if (child.links.some((link) => link.kind === "user" && deleteUserIds.has(link.id))) deletedDesignIds.add(child.id);
  }

  const deletedLegacyIds = new Set(legacyOrders.filter((order) => order.action === "delete").map((order) => order.id));

  const children: PlannedChild[] = (input.children ?? []).map((child) => {
    const remove = childParentDeleted(child, {
      user: deleteUserIds,
      order: deletedOrderIds,
      deal: deletedDealIds,
      design: deletedDesignIds,
      legacyOrder: deletedLegacyIds,
    });
    return {
      table: child.table,
      id: child.id,
      updatedAt: child.updatedAt,
      action: remove ? "delete" : "keep",
      reason: remove ? reasonForDeletedParent(child, userById, orderById, dealById) : "kept_child",
      hasRealPayment: false,
    };
  });

  const deletedEmails = new Set(users.filter((user) => user.action === "delete" && user.email).map((user) => norm(user.email)));
  const keptEmails = new Set(users.filter((user) => user.action === "keep" && user.email).map((user) => norm(user.email)));
  const preservedAffiliateIds = new Set(
    affiliates.filter((affiliate) => affiliate.userId != null && keep.has(affiliate.userId)).map((affiliate) => affiliate.id),
  );

  const stripeRecords = (input.stripeRecords ?? []).map((record) => {
    const email = norm(record.customerEmail);
    const linkedOrderDeleted = record.orderRequestId != null && deletedOrderIds.has(record.orderRequestId);
    const membershipOfPreserved =
      record.purpose === "affiliate_membership" && record.affiliateId != null && preservedAffiliateIds.has(record.affiliateId);
    const emailOfDeleted = Boolean(email) && deletedEmails.has(email) && !keptEmails.has(email);
    const remove = !membershipOfPreserved && (linkedOrderDeleted || (emailOfDeleted && record.purpose !== "affiliate_membership"));
    const hasRealPayment = stripeIsReal(record);
    let reason: PlanReason = "kept_child";
    if (remove) {
      const order = record.orderRequestId != null ? orderById.get(record.orderRequestId) : undefined;
      reason = order?.action === "delete" ? order.reason : "fake_order";
    }
    return { ...record, action: remove ? "delete" as const : "keep" as const, reason, hasRealPayment };
  });

  const estimates = (input.estimates ?? []).map((estimate) => {
    const protectedEstimate =
      (estimate.crmDealId != null && keptDealIds.has(estimate.crmDealId)) || keptLaborIds.has(estimate.id);
    const tiedToDelete =
      (estimate.orderRequestId != null && deletedOrderIds.has(estimate.orderRequestId)) ||
      (estimate.crmDealId != null && deletedDealIds.has(estimate.crmDealId)) ||
      (estimate.kitchenDesignId != null && deletedDesignIds.has(estimate.kitchenDesignId)) ||
      contentDeleteReason(estimate.customerName, estimate.customerEmail) != null;
    const remove = !protectedEstimate && tiedToDelete;
    const reason = remove
      ? contentDeleteReason(estimate.customerName, estimate.customerEmail) ??
        (estimate.orderRequestId != null ? orderById.get(estimate.orderRequestId)?.reason : undefined) ??
        "fake_order"
      : "kept_child";
    return { ...estimate, action: remove ? "delete" as const : "keep" as const, reason, hasRealPayment: false };
  });

  const unlinks: PlannerUnlink[] = [];
  const unlinkedAffiliates: PlannerAffiliate[] = [];
  const preservedAffiliates: PlannerAffiliate[] = [];
  for (const affiliate of affiliates) {
    if (affiliate.userId == null) continue;
    if (keep.has(affiliate.userId)) {
      preservedAffiliates.push(affiliate);
      continue;
    }
    if (deleteUserIds.has(affiliate.userId)) {
      unlinkedAffiliates.push(affiliate);
      unlinks.push({ table: "affiliates", id: affiliate.id, field: "userId", updatedAt: affiliate.updatedAt });
    }
  }
  for (const alias of input.globalAliases ?? []) {
    if (alias.createdByUserId != null && deleteUserIds.has(alias.createdByUserId)) {
      unlinks.push({ table: "code_aliases", id: alias.id, field: "createdByUserId", updatedAt: alias.updatedAt });
    }
  }
  for (const deal of deals) {
    if (deal.action === "keep" && deal.ownerUserId != null && deleteUserIds.has(deal.ownerUserId)) {
      unlinks.push({ table: "crm_deals", id: deal.id, field: "ownerUserId", updatedAt: deal.updatedAt });
    }
  }
  for (const estimate of estimates) {
    if (estimate.action === "keep" && estimate.orderRequestId != null && deletedOrderIds.has(estimate.orderRequestId)) {
      unlinks.push({
        table: "affiliate_installation_estimates",
        id: estimate.id,
        field: "orderRequestId",
        updatedAt: estimate.updatedAt,
      });
    }
  }

  return {
    deleteSupabaseAuth: Boolean(input.deleteSupabaseAuth),
    explicitKeep,
    keepUserIds: Array.from(keep).sort((a, b) => a - b),
    alsoDeleteUserIds: Array.from(requestedDelete).filter((id) => knownIds.has(id)).sort((a, b) => a - b),
    forcedUserIds: Array.from(forced).sort((a, b) => a - b),
    users,
    orderRequests,
    legacyOrders,
    deals,
    children,
    stripeRecords,
    estimates,
    unlinks,
    preservedAffiliates,
    unlinkedAffiliates,
    warnings,
  };
}
