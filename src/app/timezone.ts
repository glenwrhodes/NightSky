// Local time at the observer's location, using the browser's IANA time-zone data (Intl).

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    partsFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

export interface LocalParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock fields of an instant in a time zone. */
export function localParts(unixMs: number, tz: string): LocalParts {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(unixMs))) {
    if (type !== 'literal') p[type] = Number(value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

/** UTC offset of a time zone at an instant, in minutes (east positive: Tokyo = +540). */
export function offsetMinutes(tz: string, unixMs: number): number {
  const l = localParts(unixMs, tz);
  const asUtc = Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute, l.second);
  const whole = Math.floor(unixMs / 1000) * 1000;
  return Math.round((asUtc - whole) / 60000);
}

/** The instant at which the wall clock in `tz` reads the given fields. */
export function localToUnixMs(l: LocalParts, tz: string): number {
  const guess = Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute, l.second);
  const first = guess - offsetMinutes(tz, guess) * 60000;
  const second = guess - offsetMinutes(tz, first) * 60000;
  return second;
}

/** "2027-01-20T21:00" for an instant in a time zone: the value format of <input type=datetime-local>. */
export function toLocalInputValue(unixMs: number, tz: string): string {
  const l = localParts(unixMs, tz);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(l.year, 4)}-${p(l.month)}-${p(l.day)}T${p(l.hour)}:${p(l.minute)}`;
}

/** Parse "YYYY-MM-DDTHH:MM[:SS]" as a wall-clock time in `tz`. Returns null if malformed. */
export function parseLocal(value: string, tz: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map((s) => Number(s ?? 0));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  return localToUnixMs({ year, month, day, hour, minute, second }, tz);
}

/**
 * A fixed-offset zone for a longitude with no named zone: whole hours of mean solar time.
 * IANA "Etc/GMT" zones have inverted signs: UTC+9 is "Etc/GMT-9".
 */
export function solarTimeZone(lonDeg: number): string {
  const h = Math.max(-12, Math.min(14, Math.round(lonDeg / 15)));
  if (h === 0) return 'Etc/UTC';
  return `Etc/GMT${h > 0 ? '-' : '+'}${Math.abs(h)}`;
}

/** Short zone name for display, such as "HST", "GMT+9", "CET". */
export function zoneAbbreviation(unixMs: number, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(
    new Date(unixMs),
  );
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
}
