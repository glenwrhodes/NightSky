// Everything that defines a view, and its round trip through the URL hash.
//
// The hash alone is enough to set up a shot, for example:
//   #loc=maunakea&t=2027-01-20T21:00&rate=600&play=1&ui=0
// `t` is either an ISO time with Z or an offset, a wall-clock time at the place ("2027-01-20T21:00"),
// or "now". See README.md for every parameter.

import { findPlace, PLACES } from './places';
import { isValidTimeZone, parseLocal, solarTimeZone } from './timezone';

export interface AppState {
  /** Preset id, or "" for a custom location. */
  loc: string;
  place: string;
  lat: number;
  lon: number;
  tz: string;
  /** Simulated time, Unix ms (UTC). */
  t: number;
  /** Time-lapse rate: simulated seconds per real second (negative runs backwards). */
  rate: number;
  playing: boolean;
  /** Azimuth shown at the bottom of the dome. */
  viewAz: number;
  lines: boolean;
  conNames: boolean;
  starNames: boolean;
  grid: boolean;
  caption: boolean;
  ui: boolean;
}

const DEFAULT_PLACE = PLACES[0]; // Mauna Kea

/** Opening scene: Mauna Kea, 9 pm on 20 January 2027, Orion high in the south. */
export const DEFAULT_STATE: Readonly<AppState> = {
  loc: DEFAULT_PLACE.id,
  place: DEFAULT_PLACE.name,
  lat: DEFAULT_PLACE.lat,
  lon: DEFAULT_PLACE.lon,
  tz: DEFAULT_PLACE.tz,
  t: Date.UTC(2027, 0, 21, 7, 0, 0), // 2027-01-20 21:00 HST (UTC−10)
  rate: 600,
  playing: false,
  viewAz: 180,
  lines: true,
  conNames: true,
  starNames: true,
  grid: false,
  caption: true,
  ui: true,
};

export const MAX_RATE = 1e7;

const BOOL_KEYS = {
  lines: 'lines',
  names: 'conNames',
  stars: 'starNames',
  grid: 'grid',
  caption: 'caption',
  ui: 'ui',
  play: 'playing',
} as const satisfies Record<string, keyof AppState>;

function parseBool(v: string): boolean | null {
  const s = v.toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return null;
}

function parseNumber(v: string | null, min: number, max: number): number | null {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Parse a time parameter. `nowMs` is only consulted for "now". */
export function parseTime(v: string, tz: string, nowMs: number): number | null {
  const s = v.trim();
  if (s.toLowerCase() === 'now') return nowMs;
  if (/^-?\d+$/.test(s)) return Number(s); // Unix milliseconds
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? null : ms;
  }
  return parseLocal(s, tz);
}

/** Build the state for a URL hash, starting from the defaults. Unknown or invalid values are ignored. */
export function parseHash(hash: string, nowMs: number = Date.now()): AppState {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const s: AppState = { ...DEFAULT_STATE };

  const preset = findPlace(q.get('loc') ?? '');
  if (preset) Object.assign(s, { loc: preset.id, place: preset.name, lat: preset.lat, lon: preset.lon, tz: preset.tz });

  const lat = parseNumber(q.get('lat'), -90, 90);
  const lon = parseNumber(q.get('lon'), -180, 180);
  if ((lat !== null && lat !== s.lat) || (lon !== null && lon !== s.lon)) {
    s.lat = lat ?? s.lat;
    s.lon = lon ?? s.lon;
    s.loc = '';
    s.place = formatLatLon(s.lat, s.lon);
    s.tz = solarTimeZone(s.lon);
  }
  const tz = q.get('tz');
  if (tz && isValidTimeZone(tz)) s.tz = tz;
  const place = q.get('place');
  if (place) s.place = place.slice(0, 80);

  const t = q.get('t');
  if (t) {
    const ms = parseTime(t, s.tz, nowMs);
    if (ms !== null) s.t = ms;
  }

  const rate = parseNumber(q.get('rate'), -MAX_RATE, MAX_RATE);
  if (rate !== null) s.rate = rate;
  const az = parseNumber(q.get('az'), -360, 720);
  if (az !== null) s.viewAz = ((az % 360) + 360) % 360;

  for (const [key, field] of Object.entries(BOOL_KEYS)) {
    const v = q.get(key);
    const b = v === null ? null : parseBool(v);
    if (b !== null) (s as unknown as Record<string, boolean>)[field] = b;
  }
  return s;
}

/** The URL hash for a state. Parsing it back gives the same state. */
export function toHash(s: AppState): string {
  const q = new URLSearchParams();
  const preset = findPlace(s.loc);
  const matchesPreset = preset && preset.lat === s.lat && preset.lon === s.lon;
  if (matchesPreset) {
    q.set('loc', preset.id);
    if (s.tz !== preset.tz) q.set('tz', s.tz);
    if (s.place !== preset.name) q.set('place', s.place);
  } else {
    q.set('lat', String(round(s.lat, 5)));
    q.set('lon', String(round(s.lon, 5)));
    q.set('tz', s.tz);
    if (s.place !== formatLatLon(round(s.lat, 5), round(s.lon, 5))) q.set('place', s.place);
  }
  q.set('t', new Date(Math.round(s.t)).toISOString().replace('.000Z', 'Z'));
  q.set('rate', String(round(s.rate, 4)));
  q.set('play', s.playing ? '1' : '0');
  q.set('az', String(round(s.viewAz, 1)));
  for (const [key, field] of Object.entries(BOOL_KEYS)) {
    if (key === 'play') continue;
    q.set(key, s[field] ? '1' : '0');
  }
  return q.toString();
}

export function formatLatLon(lat: number, lon: number): string {
  const f = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;
  return `${f(lat, 'N', 'S')} ${f(lon, 'E', 'W')}`;
}

function round(v: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}
