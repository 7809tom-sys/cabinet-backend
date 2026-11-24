// Pure schedule logic shared by the server (settings validation) and the PC script (is a backup due now?).
// No network, no file access. Uses Intl so IANA time zones and daylight saving are handled by the platform.

export const DEFAULT_SCHEDULE = Object.freeze({ dailyTime: "03:00", timezone: "America/New_York", retentionDays: 90 });
export const MIN_RETENTION_DAYS = 30;
export const MAX_RETENTION_DAYS = 365;

export function isValidDailyTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidTimezone(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isValidRetentionDays(value) {
  return Number.isInteger(value) && value >= MIN_RETENTION_DAYS && value <= MAX_RETENTION_DAYS;
}

/** Local calendar date (YYYY-MM-DD) and minutes since local midnight, for an instant in a time zone. */
export function localParts(now, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  const hour = Number(get("hour")) % 24;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + Number(get("minute")) };
}

/**
 * Is a backup due? Due when the configured time has passed today (in the configured zone)
 * and today's snapshot is not already done. `doneDates` is the set of local dates that already have a good snapshot.
 */
export function isBackupDue({ now = new Date(), dailyTime, timezone, doneDates = [] }) {
  if (!isValidDailyTime(dailyTime) || !isValidTimezone(timezone)) {
    return { due: false, reason: "invalid-schedule", today: null };
  }
  const { date, minutes } = localParts(now, timezone);
  const [h, m] = dailyTime.split(":").map(Number);
  if (doneDates.includes(date)) return { due: false, reason: "already-done-today", today: date };
  if (minutes < h * 60 + m) return { due: false, reason: "before-scheduled-time", today: date };
  return { due: true, reason: "scheduled-time-passed", today: date };
}
