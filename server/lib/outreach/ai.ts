// AI drafting for outreach emails, plus the safety gate every draft must pass.
// A draft that fails the gate twice is replaced by a fixed, reviewed template,
// so nothing the model invents can reach a customer.

import type { OutreachStep } from "@shared/crmOutreach";

/** Supplier / distributor names that never appear in customer outreach. */
export const BUILT_IN_BLOCKED_NAMES = [
  "US Cabinet Depot",
  "U.S. Cabinet Depot",
  "United States Cabinet Depot",
  "USCD",
  "Pelican",
] as const;

export const OUTREACH_SYSTEM_PROMPT = `You write short follow-up emails for CabinetDealz, a kitchen and bath cabinet business. Each email goes to a past or prospective customer and is written in a warm, natural, personal tone, in the first person, from {{SENDER_NAME}}.

Hard rules. Breaking any of them makes the email unusable:
1. Use only the facts given under CONTACT FACTS and STEP. Never invent history, products, projects, prices, discounts, promotions, statistics, numbers, deadlines, reviews or testimonials.
2. Do not mention any price, dollar amount, percentage, discount, sale or financing. If STEP includes an OFFER, you may mention that offer using its exact wording. If there is no OFFER, mention no offer at all.
3. Never name any supplier, manufacturer, distributor or cabinet brand. The only business you name is CabinetDealz.
4. Never claim or suggest that you are a human, that a person typed this by hand, or that the message is not automated. Do not discuss how the email was written.
5. Do not include links, web addresses, email addresses, phone numbers, a signature or a sign-off. The system adds the signature, the link and the legal footer.
6. Subject line: honest and plain, under 70 characters, no "Re:" or "Fwd:", no all-caps words, no false urgency.
7. Body: 50 to 140 words of plain text in 2 or 3 short paragraphs. Start with a greeting that uses the first name if one is given. End by inviting a reply.
8. If the facts are thin, stay general rather than guessing.

Return JSON only, exactly: {"subject": "...", "body": "..."}`;

export type OutreachContactFacts = {
  firstName: string | null;
  city: string | null;
  state: string | null;
  lastPurchaseDate: string | null;
  customerListName: string | null;
  notesFromList: string | null;
  savedDesignCount: number;
  previousSubjects: string[];
};

export function seasonFor(date: Date, timeZone = "America/New_York"): "winter" | "spring" | "summer" | "fall" {
  const month = Number(new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone }).format(date));
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "fall";
}

export function buildOutreachUserPrompt(facts: OutreachContactFacts, step: OutreachStep, stepNumber: number, now: Date): string {
  const contact = {
    firstName: facts.firstName,
    city: facts.city,
    state: facts.state,
    lastPurchaseDate: facts.lastPurchaseDate,
    customerList: facts.customerListName,
    notesFromList: facts.notesFromList ? facts.notesFromList.slice(0, 300) : null,
    hasSavedDesignOnSite: facts.savedDesignCount > 0,
  };
  const lines = [
    "CONTACT FACTS (JSON):",
    JSON.stringify(contact),
    "",
    `STEP ${stepNumber}: ${step.label}`,
    `GOAL: ${step.goal}`,
    step.offerText ? `OFFER (exact wording, optional to use): ${step.offerText}` : "OFFER: none. Mention no offer.",
    `CURRENT SEASON: ${seasonFor(now)}`,
  ];
  if (facts.previousSubjects.length) {
    lines.push(`EARLIER EMAILS IN THIS SEQUENCE (subjects, do not repeat them): ${facts.previousSubjects.join(" | ")}`);
  }
  return lines.join("\n");
}

export type OutreachDraft = { subject: string; body: string };

export type DraftCheck = { ok: true } | { ok: false; problems: string[] };

const HUMAN_CLAIM_PATTERNS: RegExp[] = [
  /\b(i am|i'm|im)\s+(a\s+)?(real|actual|live)\s+(person|human)\b/i,
  /\breal person\b/i,
  /\bnot\s+(a\s+)?(bot|robot|machine|computer|ai|automated|automatic)\b/i,
  /\b(isn't|is not|wasn't|was not)\s+(an?\s+)?(automated|automatic|bot|ai|robot)\b/i,
  /\bhand[\s-]?(written|typed)\b/i,
  /\bpersonally\s+(wrote|typed|writing|typing)\b/i,
  /\bwritten\s+by\s+(me|hand)\b/i,
];

const MONEY_PATTERNS: RegExp[] = [
  /[$€£¢]/,
  /%/,
  /\bpercent\b/i,
  /\b(discount|discounted|coupon|promo(tion)?\s*code|sale\s+price|on\s+sale|clearance|financing|rebate|cheapest|lowest\s+price|best\s+price|save\s+up\s+to|off\s+your)\b/i,
  /\bdollars?\b/i,
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsBlockedName(text: string, blockedNames: readonly string[]): string | null {
  for (const name of blockedNames) {
    const trimmed = name.trim();
    if (trimmed.length < 3) continue;
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(trimmed)}($|[^a-z0-9])`, "i");
    if (pattern.test(text)) return trimmed;
  }
  return null;
}

/**
 * The gate. Rejects anything that claims to be human, names a supplier,
 * mentions money or a discount not in Tom's own offer text, carries a number
 * that is not in the facts (an invented stat), or contains links/contacts.
 */
export function checkOutreachDraft(
  draft: OutreachDraft,
  opts: { blockedNames: readonly string[]; factsText: string; offerText: string },
): DraftCheck {
  const problems: string[] = [];
  const subject = draft.subject.trim();
  const body = draft.body.trim();
  const all = `${subject}\n${body}`;
  const offer = opts.offerText.trim();
  const withoutOffer = offer ? all.split(offer).join(" ") : all;

  if (subject.length < 3 || subject.length > 120) problems.push("subject length");
  if (/^\s*(re|fw|fwd)\s*:/i.test(subject)) problems.push("subject pretends to be a reply or forward");
  if (/\b[A-Z]{5,}\b/.test(subject.replace(/CABINETDEALZ/g, ""))) problems.push("all-caps subject word");
  if (body.length < 120 || body.length > 1600) problems.push("body length");
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co)\b/i.test(all)) problems.push("contains a link");
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(all)) problems.push("contains an email address");
  if (/\{\{|\}\}|\[(first\s*)?name\]|\[[A-Z _]+\]/i.test(all)) problems.push("unfilled placeholder");
  const blocked = containsBlockedName(all, opts.blockedNames);
  if (blocked) problems.push(`names a supplier (${blocked})`);
  if (HUMAN_CLAIM_PATTERNS.some((pattern) => pattern.test(all))) problems.push("claims to be human or not automated");
  if (MONEY_PATTERNS.some((pattern) => pattern.test(withoutOffer))) problems.push("mentions money, a discount or an offer that Tom did not write");
  const allowedNumbers = new Set((`${opts.factsText} ${offer}`.match(/\d+/g) ?? []));
  const invented = (withoutOffer.match(/\d+/g) ?? []).filter((n) => !allowedNumbers.has(n));
  if (invented.length) problems.push(`numbers not in the facts (${Array.from(new Set(invented)).slice(0, 5).join(", ")})`);
  return problems.length ? { ok: false, problems } : { ok: true };
}

export function parseDraftJson(content: string): OutreachDraft | null {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as { subject?: unknown; body?: unknown };
    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") return null;
    return { subject: parsed.subject.replace(/\s+/g, " ").trim(), body: parsed.body.replace(/\r\n/g, "\n").trim() };
  } catch {
    return null;
  }
}

/** Fixed, reviewed copy used when the AI is unavailable or its draft fails the gate. */
export function fallbackDraft(step: OutreachStep, stepIndex: number, facts: OutreachContactFacts, now: Date = new Date()): OutreachDraft {
  const hello = facts.firstName ? `Hi ${facts.firstName},` : "Hello,";
  const offer = step.offerText ? `\n\nRight now we're offering ${step.offerText}.` : "";
  if (stepIndex === 0) {
    return {
      subject: "Checking in from CabinetDealz",
      body: `${hello}\n\nIt has been a while, and I wanted to reach out. CabinetDealz now has an online kitchen designer where you can lay out a kitchen, try door styles and colors, and see it in 3D before you decide anything.${offer}\n\nIf you have a kitchen, bath or cabinet project on your mind, I'd be glad to help. Just reply to this email with any question.`,
    };
  }
  if (stepIndex === 1) {
    return {
      subject: "Any cabinet projects coming up?",
      body: `${hello}\n\nI'm following up on my last note. If a kitchen or bath update is somewhere on your list, even a ways off, I'm happy to answer questions or help you get a design started.${offer}\n\nJust hit reply and let me know what you're thinking.`,
    };
  }
  return {
    subject: `A quick ${seasonFor(now)} check-in from CabinetDealz`,
    body: `${hello}\n\nWith the season changing, a lot of people start thinking about home projects. If new cabinets are on your mind, you can start a design online whenever it suits you, and I'm glad to help along the way.${offer}\n\nReply any time with a question.`,
  };
}

export type LlmInvoke = (params: {
  messages: Array<{ role: "system" | "user"; content: string }>;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}) => Promise<{ choices?: Array<{ message?: { content?: unknown } }> }>;

export type DraftResult = OutreachDraft & { source: "ai" | "fallback"; problems: string[] };

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : "")).join("");
  }
  return "";
}

export function factsText(facts: OutreachContactFacts): string {
  return [facts.firstName, facts.city, facts.state, facts.lastPurchaseDate, facts.customerListName, facts.notesFromList].filter(Boolean).join(" ");
}

/** Up to two AI attempts; anything that fails the gate falls back to the fixed copy. */
export async function draftOutreachEmail(input: {
  facts: OutreachContactFacts;
  step: OutreachStep;
  stepIndex: number;
  senderName: string;
  blockedNames: readonly string[];
  now: Date;
  llm: LlmInvoke | null;
}): Promise<DraftResult> {
  const problems: string[] = [];
  const check = (draft: OutreachDraft) => checkOutreachDraft(draft, {
    blockedNames: input.blockedNames,
    factsText: factsText(input.facts),
    offerText: input.step.offerText,
  });
  if (input.llm) {
    const system = OUTREACH_SYSTEM_PROMPT.replace("{{SENDER_NAME}}", input.senderName.replace(/[{}]/g, ""));
    const user = buildOutreachUserPrompt(input.facts, input.step, input.stepIndex + 1, input.now);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await input.llm({
          messages: [
            { role: "system", content: system },
            { role: "user", content: attempt === 0 ? user : `${user}\n\nYour previous draft broke these rules: ${problems.join("; ")}. Write a new one that follows every rule.` },
          ],
          max_tokens: 600,
          response_format: { type: "json_object" },
        });
        const draft = parseDraftJson(contentText(response.choices?.[0]?.message?.content));
        if (!draft) { problems.push("AI reply was not valid JSON"); continue; }
        const result = check(draft);
        if (result.ok) return { ...draft, source: "ai", problems };
        problems.push(...result.problems);
      } catch (error) {
        problems.push(`AI unavailable: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`);
        break;
      }
    }
  } else {
    problems.push("AI not configured");
  }
  const fallback = fallbackDraft(input.step, input.stepIndex, input.facts, input.now);
  return { ...fallback, source: "fallback", problems };
}
