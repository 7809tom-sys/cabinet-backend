import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { storagePut } from "./storage";
import { sendEmail } from "./email";

/** Careers applications are emailed to the sales inbox (Tom, Nov 11, 2026). CAREERS_NOTIFY_EMAIL overrides it. */
export const CAREERS_NOTIFY_EMAIL_DEFAULT = "sales@cabinetdealz.com";
export function careersNotifyEmail(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.CAREERS_NOTIFY_EMAIL?.trim();
  return v ? v : CAREERS_NOTIFY_EMAIL_DEFAULT;
}
import { invokeLLM, type InvokeResult } from "./_core/llm";

/**
 * Public career application endpoints, used by public/careers.html:
 *   POST /api/careers/apply         — save an application (and optional resume)
 *   POST /api/careers/parse-resume  — extract form fields from a resume (saves nothing)
 *
 * Apply: no login. JSON body. Saves to cabinet_dealz.sales_rep_applications with
 * source = 'careers' and status = 'pending'. The optional resume arrives as
 * base64 and is stored in the private bucket under career-resumes/.
 *
 * Parse: no login. JSON body { resume: { name, type, data } }. Reads a PDF
 * through invokeLLM and returns { fields } for autofill. Never writes to the
 * database or object storage. Word resumes are accepted on apply but cannot
 * be parsed here (invokeLLM file_url is PDF-only; no docx extractor is
 * installed), so parse returns 415 with { fields: {} }.
 */

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const RESUME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
const POSITIONS = ["Sales Rep", "Installer", "Designer", "Warehouse/Delivery", "Office/Admin", "Other"];
const WORK_TYPES = ["Full-time", "Part-time", "Contract (1099)"];

// Simple per-IP limit: 5 submissions per 10 minutes.
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

// Same style as apply, but a separate bucket so a few parse attempts don't
// burn the applicant's submit quota.
const parseHits = new Map<string, number[]>();
function parseRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (parseHits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  parseHits.set(ip, recent);
  return recent.length > 5;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

type ParsedResumeFields = {
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  yearsExperience?: number;
  workHistory?: string;
  linkedinUrl?: string;
};

const EMPTY_PARSE = { fields: {} as ParsedResumeFields };

function clientIp(req: Request): string {
  return String(req.headers["x-forwarded-for"] ?? req.ip ?? "").split(",")[0].trim();
}

function resumeBase64(data: string): string {
  const trimmed = data.trim();
  if (trimmed.startsWith("data:") && trimmed.includes(",")) {
    return trimmed.slice(trimmed.indexOf(",") + 1);
  }
  return trimmed;
}

function llmMessageText(result: InvokeResult): string {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : ""))
      .join("\n");
  }
  return "";
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Keep only fields that are present and well-formed. Never invent values.
function sanitizeParsedFields(raw: unknown): ParsedResumeFields {
  const src = asRecord(raw);
  const nested = asRecord(src.fields);
  const b = Object.keys(nested).length ? nested : src;
  const out: ParsedResumeFields = {};

  const fullName = str(b.fullName, 256);
  if (fullName.length >= 2) out.fullName = fullName;

  const email = str(b.email, 320).toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.email = email;

  const phone = str(b.phone, 32);
  if (/^[\d\s().+\-]{7,20}$/.test(phone)) out.phone = phone;

  const city = str(b.city, 128);
  if (city.length >= 2) out.city = city;

  const state = str(b.state, 64).toUpperCase();
  if (/^[A-Z]{2}$/.test(state)) out.state = state;

  const years = Number(b.yearsExperience);
  if (Number.isInteger(years) && years >= 0 && years <= 60) out.yearsExperience = years;

  const workHistory = str(b.workHistory, 1500);
  if (workHistory.length >= 10) out.workHistory = workHistory;

  const linkedinUrl = str(b.linkedinUrl, 512);
  if (linkedinUrl && /^https?:\/\/.+\..+/.test(linkedinUrl)) out.linkedinUrl = linkedinUrl;

  return out;
}

const RESUME_FIELDS_SCHEMA = {
  name: "career_resume_fields",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      fullName: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      city: { type: "string" },
      state: { type: "string", description: "Two-letter USPS state or territory code" },
      yearsExperience: { type: "integer", description: "Whole years of relevant experience, 0-60" },
      workHistory: {
        type: "string",
        description: "Short work-history summary, 1500 characters or fewer",
      },
      linkedinUrl: { type: "string" },
    },
  },
};

function logParseFailure(): void {
  // Do not log the error body, resume contents, or API keys.
  console.error("[Careers] parse-resume failed");
}

export function registerCareersApply(app: Express) {
  app.post("/api/careers/apply", async (req: Request, res: Response) => {
    try {
      const ip = String(req.headers["x-forwarded-for"] ?? req.ip ?? "").split(",")[0].trim();
      if (rateLimited(ip)) {
        return res.status(429).json({ message: "Too many submissions. Please try again later." });
      }

      const b = req.body ?? {};
      // Honeypot: real people leave this hidden field empty.
      if (str(b.website, 200)) return res.status(200).json({ ok: true });

      const fullName = str(b.fullName, 256);
      const email = str(b.email, 320).toLowerCase();
      const phone = str(b.phone, 32);
      const city = str(b.city, 128);
      const state = str(b.state, 2).toUpperCase();
      const position = str(b.position, 64);
      const workType = str(b.workType, 32);
      const availability = str(b.availability, 10);
      const years = Number(b.yearsExperience);
      const workHistory = str(b.workHistory, 10000);
      const whyCabinetDealz = str(b.whyCabinetDealz, 5000);
      const heardAboutUs = str(b.heardAboutUs, 256);
      const linkedinUrl = str(b.linkedinUrl, 512);
      const consent = b.consent === true || b.consent === "on" || b.consent === "true";

      const errors: string[] = [];
      if (fullName.length < 2) errors.push("fullName");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email");
      if (!/^[\d\s().+\-]{7,20}$/.test(phone)) errors.push("phone");
      if (city.length < 2) errors.push("city");
      if (!/^[A-Z]{2}$/.test(state)) errors.push("state");
      if (!POSITIONS.includes(position)) errors.push("position");
      if (!WORK_TYPES.includes(workType)) errors.push("workType");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(availability)) errors.push("availability");
      if (!Number.isInteger(years) || years < 0 || years > 60) errors.push("yearsExperience");
      if (workHistory.length < 10) errors.push("workHistory");
      if (whyCabinetDealz.length < 10) errors.push("whyCabinetDealz");
      if (heardAboutUs.length < 2) errors.push("heardAboutUs");
      if (linkedinUrl && !/^https?:\/\/.+\..+/.test(linkedinUrl)) errors.push("linkedinUrl");
      if (!consent) errors.push("consent");
      if (errors.length) {
        return res.status(400).json({ message: "Please fix: " + errors.join(", "), fields: errors });
      }

      const db = await getDb();
      if (!db) return res.status(503).json({ message: "Applications are unavailable right now." });

      let resumeKey: string | null = null;
      let resumeFileName: string | null = null;
      const resume = b.resume;
      if (resume && typeof resume === "object" && typeof resume.data === "string") {
        const ext = RESUME_TYPES[String(resume.type)];
        if (!ext) return res.status(400).json({ message: "Resume must be a PDF or Word file." });
        const bytes = Buffer.from(resume.data, "base64");
        if (bytes.length === 0 || bytes.length > MAX_RESUME_BYTES) {
          return res.status(400).json({ message: "Resume must be under 5 MB." });
        }
        resumeFileName = str(resume.name, 256) || `resume.${ext}`;
        const safe = resumeFileName.replace(/[^A-Za-z0-9._-]/g, "_");
        const put = await storagePut(`career-resumes/${Date.now()}-${safe}`, bytes, String(resume.type));
        resumeKey = put.key;
      }

      await db.execute(sql`
        INSERT INTO cabinet_dealz.sales_rep_applications
          (fullName, email, phone, state, status, source, city, position, workType,
           availableFrom, yearsExperience, workHistory, whyCabinetDealz, heardAboutUs,
           linkedinUrl, resumeKey, resumeFileName, consentAt)
        VALUES
          (${fullName}, ${email}, ${phone}, ${state}, 'pending', 'careers', ${city}, ${position}, ${workType},
           ${availability}, ${years}, ${workHistory}, ${whyCabinetDealz}, ${heardAboutUs},
           ${linkedinUrl || null}, ${resumeKey}, ${resumeFileName}, NOW())
      `);

      // Best-effort email to the sales inbox; never blocks the save.
      const lines = [
        `Name: ${fullName}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        `Location: ${[city, state].filter(Boolean).join(", ")}`,
        `Position: ${position}`,
        `Work type: ${workType}`,
        `Resume: ${resumeFileName ?? "none"}`,
        "Full application is in sales_rep_applications (source = careers).",
      ].join("\n");
      const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      void sendEmail({
        to: careersNotifyEmail(),
        replyTo: email,
        subject: `[Cabinet Dealz] New career application: ${fullName}`,
        text: lines,
        html: `<h3>New career application: ${esc(fullName)}</h3><div style="white-space:pre-wrap">${esc(lines)}</div>`,
      }).catch(() => undefined);

      return res.status(201).json({ ok: true });
    } catch (error) {
      console.error("[Careers] apply failed", error instanceof Error ? error.message : "unknown error");
      return res.status(500).json({ message: "Something went wrong saving your application." });
    }
  });

  app.post("/api/careers/parse-resume", async (req: Request, res: Response) => {
    try {
      const ip = clientIp(req);
      if (parseRateLimited(ip)) {
        return res.status(429).json({ message: "Too many submissions. Please try again later.", fields: {} });
      }

      const resume = req.body?.resume;
      if (!resume || typeof resume !== "object" || typeof resume.data !== "string") {
        logParseFailure();
        return res.status(200).json(EMPTY_PARSE);
      }

      const mime = String(resume.type);
      const ext = RESUME_TYPES[mime];
      if (!ext) {
        logParseFailure();
        return res.status(415).json(EMPTY_PARSE);
      }

      const bytes = Buffer.from(resumeBase64(resume.data), "base64");
      if (bytes.length === 0 || bytes.length > MAX_RESUME_BYTES) {
        logParseFailure();
        return res.status(200).json(EMPTY_PARSE);
      }

      // invokeLLM's file_url content part only types application/pdf. There is
      // no mammoth (or other docx extractor) in package.json, so Word files
      // are rejected here and the applicant fills the form by hand. The same
      // file can still be submitted later to /api/careers/apply.
      if (mime !== "application/pdf") {
        console.error("[Careers] parse-resume skipped non-PDF");
        return res.status(415).json(EMPTY_PARSE);
      }

      const dataUrl = `data:application/pdf;base64,${resumeBase64(resume.data)}`;
      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content:
              "You extract contact and work-history fields from a resume. Return only facts clearly present in the document. Omit any field you cannot read with confidence. Never invent a name, email, phone, address, or URL. state must be a two-letter USPS code. workHistory is a short summary of 1500 characters or fewer.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the applicant fields from this resume." },
              { type: "file_url", file_url: { url: dataUrl, mime_type: "application/pdf" } },
            ],
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: RESUME_FIELDS_SCHEMA,
        },
        maxTokens: 800,
      });

      const text = llmMessageText(result);
      if (!text) {
        logParseFailure();
        return res.status(200).json(EMPTY_PARSE);
      }

      const fields = sanitizeParsedFields(parseJsonObject(text));
      return res.status(200).json({ fields });
    } catch {
      logParseFailure();
      return res.status(200).json(EMPTY_PARSE);
    }
  });
}
