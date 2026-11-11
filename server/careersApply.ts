import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { storagePut } from "./storage";

/**
 * Public career application endpoint: POST /api/careers/apply
 *
 * Used by the standalone careers page (public/careers.html on the frontend).
 * No login. JSON body. Saves to cabinet_dealz.sales_rep_applications with
 * source = 'careers' and status = 'pending'. The optional resume arrives as
 * base64 and is stored in the private bucket under career-resumes/.
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

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
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

      return res.status(201).json({ ok: true });
    } catch (error) {
      console.error("[Careers] apply failed", error instanceof Error ? error.message : "unknown error");
      return res.status(500).json({ message: "Something went wrong saving your application." });
    }
  });
}
