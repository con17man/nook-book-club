import { CLUB_TIMEZONE } from "@/lib/env";

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLUB_TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const longDateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLUB_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "Mon 20 Oct, 19:00" in the club's timezone. */
export function formatDateTime(iso: string | Date) {
  return dateTimeFormat.format(new Date(iso));
}

/** "Monday 20 October 2026, 19:00" in the club's timezone. */
export function formatLongDateTime(iso: string | Date) {
  return longDateFormat.format(new Date(iso));
}

/** "in 5h 12m" / "in 2 days" / "now". */
export function formatTimeLeft(iso: string | Date, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `in ${hours}h ${minutes % 60}m`;
  return `in ${Math.floor(hours / 24)} days`;
}

function offsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wallAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Interpret a `<input type="datetime-local">` value ("2026-10-20T19:00") in the club timezone. */
export function wallTimeToDate(local: string, timeZone = CLUB_TIMEZONE): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  const first = wallAsUtc - offsetMs(new Date(wallAsUtc), timeZone);
  // Re-check the offset at the resulting instant to handle DST transitions.
  const second = wallAsUtc - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** The reverse of wallTimeToDate, for pre-filling datetime-local inputs. */
export function dateToWallTime(iso: string | Date, timeZone = CLUB_TIMEZONE) {
  const date = new Date(iso);
  const shifted = new Date(date.getTime() + offsetMs(date, timeZone));
  return shifted.toISOString().slice(0, 16);
}
