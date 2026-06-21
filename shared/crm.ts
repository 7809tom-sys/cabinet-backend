// Shared CRM pipeline constants used by both the server router (validation) and
// the client board (columns, labels). Keep enum values in sync with the
// `crm_deals` table in drizzle/schema.ts.

export const CRM_STAGES = ["new", "contacted", "qualified", "quoted", "won", "lost"] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

// Stages shown as draggable pipeline columns (won/lost are terminal outcomes
// rendered separately as collapsed/closed columns but still valid stages).
export const CRM_PIPELINE_STAGES: CrmStage[] = ["new", "contacted", "qualified", "quoted"];
export const CRM_CLOSED_STAGES: CrmStage[] = ["won", "lost"];

export const CRM_STAGE_LABELS: Record<CrmStage, { en: string; es: string }> = {
  new: { en: "New", es: "Nuevo" },
  contacted: { en: "Contacted", es: "Contactado" },
  qualified: { en: "Qualified", es: "Calificado" },
  quoted: { en: "Quoted", es: "Cotizado" },
  won: { en: "Won", es: "Ganado" },
  lost: { en: "Lost", es: "Perdido" },
};

export const CRM_PRIORITIES = ["low", "medium", "high"] as const;
export type CrmPriority = (typeof CRM_PRIORITIES)[number];

export const CRM_PRIORITY_LABELS: Record<CrmPriority, { en: string; es: string }> = {
  low: { en: "Low", es: "Baja" },
  medium: { en: "Medium", es: "Media" },
  high: { en: "High", es: "Alta" },
};

export const CRM_ACTIVITY_KINDS = ["note", "call", "email", "meeting", "stage_change", "task"] as const;
export type CrmActivityKind = (typeof CRM_ACTIVITY_KINDS)[number];

export const CRM_SOURCES = ["manual", "order_request", "pro_application", "storefront", "referral"] as const;
export type CrmSource = (typeof CRM_SOURCES)[number];

export const CRM_LANGUAGES = ["en", "es"] as const;
export type CrmLanguage = (typeof CRM_LANGUAGES)[number];

export function isClosedStage(stage: CrmStage): boolean {
  return stage === "won" || stage === "lost";
}
