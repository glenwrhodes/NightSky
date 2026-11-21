// Night Sky: wires the catalogue, renderer, clock, URL state and controls together.
//
// The animation runs entirely off requestAnimationFrame timestamps (performance.now() timeline), so
// a headless recorder that drives the page clock gets identical, deterministic frames. The URL hash
// alone sets up a shot; see README.md.

import './style.css';
import { SimClock } from './app/clock';
import { PLACES, findPlace } from './app/places';
import { RATE_PRESETS, rateLabel, stepRate } from './app/rates';
import { formatLatLon, parseHash, toHash, type AppState } from './app/state';
import {
  formatLocalDate,
  formatLocalInput,
  isValidTimeZone,
  parseLocal,
  solarTimeZone,
  zoneAbbreviation,
} from './app/timezone';
import { MAX_TIME_MS, MAX_YEAR, MIN_TIME_MS, MIN_YEAR, formatYear } from './astro/time';
import { designation, loadCatalog, type Star } from './sky/catalog';
import { resolveFigures } from './sky/constellations';
import { Renderer, type FrameInfo } from './render/renderer';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const catalog = loadCatalog();
const figures = resolveFigures(catalog);
const canvas = $<HTMLCanvasElement>('sky');
const renderer = new Renderer(canvas, catalog, figures);

let state: AppState = parseHash(location.hash);
// The clock never leaves the supported range; a time-lapse that reaches either end stops there.
const clock = new SimClock(state.t, state.rate, state.playing, MIN_TIME_MS, MAX_TIME_MS);
const RANGE_TEXT = `${formatYear(MIN_YEAR)} to ${formatYear(MAX_YEAR)}`;
$('rangeText').textContent = RANGE_TEXT;
let simMs = state.t;
let hovered: Star | null = null;
let lastFrame: FrameInfo | null = null;

const realNow = () => performance.now();

// ---------- Controls ----------

const el = {
  place: $<HTMLSelectElement>('place'),
  lat: $<HTMLInputElement>('lat'),
  lon: $<HTMLInputElement>('lon'),
  geo: $<HTMLButtonElement>('geo'),
  time: $<HTMLInputElement>('time'),
  tzLabel: $('tzLabel'),
  minusHour: $<HTMLButtonElement>('minusHour'),
  now: $<HTMLButtonElement>('now'),
  plusHour: $<HTMLButtonElement>('plusHour'),
  play: $<HTMLButtonElement>('play'),
  reverse: $<HTMLButtonElement>('reverse'),
  rate: $<HTMLSelectElement>('rate'),
  lines: $<HTMLInputElement>('lines'),
  conNames: $<HTMLInputElement>('conNames'),
  starNames: $<HTMLInputElement>('starNames'),
  grid: $<HTMLInputElement>('grid'),
  caption: $<HTMLInputElement>('captionToggle'),
  captionBox: $('caption'),
  capPlace: $('capPlace'),
  capTime: $('capTime'),
  capSub: $('capSub'),
  tooltip: $('tooltip'),
};

for (const p of PLACES) el.place.add(new Option(p.name, p.id));
el.place.add(new Option('Custom location', ''));

const TOGGLES = ['lines', 'conNames', 'starNames', 'grid', 'caption'] as const;

function fillRateOptions(): void {
  el.rate.replaceChildren();
  for (const p of RATE_PRESETS) el.rate.add(new Option(p.label, String(p.value)));
  const r = Math.abs(state.rate);
  if (!RATE_PRESETS.some((p) => Math.abs(p.value - r) < 1e-6)) el.rate.add(new Option(rateLabel(r), String(r)));
  el.rate.value = String(RATE_PRESETS.find((p) => Math.abs(p.value - r) < 1e-6)?.value ?? r);
}

/** Push state into every control (after loading or a URL change). */
function syncControls(): void {
  el.place.value = state.loc;
  el.lat.value = String(state.lat);
  el.lon.value = String(state.lon);
  for (const k of TOGGLES) el[k].checked = state[k];
  fillRateOptions();
  syncPlayControls();
  document.body.classList.toggle('ui-hidden', !state.ui);
  el.captionBox.hidden = !state.caption;
  lastTimeInput = '';
}

function syncPlayControls(): void {
  wasPlaying = clock.playing;
  el.play.textContent = clock.playing ? 'Pause' : 'Play';
  el.reverse.setAttribute('aria-pressed', String(clock.rate < 0));
}

let hashTimer = 0;
/** Write the state to the URL (without adding history entries), debounced. */
function saveHash(): void {
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    state.t = simMs;
    state.rate = clock.rate;
    state.playing = clock.playing;
    history.replaceState(null, '', `#${toHash(state)}`);
  }, 250);
}

function setTime(ms: number): void {
  clock.setTime(ms, realNow()); // clamps to the supported range
  simMs = clock.now(realNow());
  lastTimeInput = '';
  saveHash();
}

function setLocation(lat: number, lon: number, tz: string, place: string, loc = ''): void {
  Object.assign(state, { lat, lon, tz, place, loc });
  el.place.value = loc;
  el.lat.value = String(lat);
  el.lon.value = String(lon);
  lastTimeInput = '';
  saveHash();
}

el.place.addEventListener('change', () => {
  const p = findPlace(el.place.value);
  if (p) setLocation(p.lat, p.lon, p.tz, p.name, p.id);
});

function onLatLonInput(): void {
  const lat = Number(el.lat.value);
  const lon = Number(el.lon.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  setLocation(lat, lon, solarTimeZone(lon), formatLatLon(lat, lon));
}
el.lat.addEventListener('change', onLatLonInput);
el.lon.addEventListener('change', onLatLonInput);

el.geo.addEventListener('click', () => {
  if (!navigator.geolocation) return;
  el.geo.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = Math.round(pos.coords.latitude * 1e4) / 1e4;
      const lon = Math.round(pos.coords.longitude * 1e4) / 1e4;
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setLocation(lat, lon, isValidTimeZone(browserTz) ? browserTz : solarTimeZone(lon), 'My location');
      el.geo.textContent = 'Use my location';
    },
    () => {
      el.geo.textContent = 'Location unavailable';
      setTimeout(() => (el.geo.textContent = 'Use my location'), 2500);
    },
  );
});

el.time.addEventListener('change', () => {
  const ms = parseLocal(el.time.value, state.tz);
  el.time.classList.toggle('invalid', ms === null);
  if (ms !== null) setTime(ms);
});
el.time.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') el.time.blur();
});
el.minusHour.addEventListener('click', () => setTime(simMs - 3600_000));
el.plusHour.addEventListener('click', () => setTime(simMs + 3600_000));
el.now.addEventListener('click', () => setTime(Date.now()));

function togglePlay(): void {
  clock.setPlaying(!clock.playing, realNow());
  syncPlayControls();
  saveHash();
}
function setRate(rate: number): void {
  clock.setRate(rate, realNow());
  fillRateOptions();
  syncPlayControls();
  saveHash();
}
el.play.addEventListener('click', togglePlay);
el.reverse.addEventListener('click', () => setRate(-clock.rate));
el.rate.addEventListener('change', () => setRate(Number(el.rate.value) * (clock.rate < 0 ? -1 : 1)));

for (const k of TOGGLES) {
  el[k].addEventListener('change', () => {
    state[k] = el[k].checked;
    el.captionBox.hidden = !state.caption;
    saveHash();
  });
}

// On small screens the panel starts folded so the dome is visible.
const panel = $('panel');
const collapseBtn = $<HTMLButtonElement>('collapse');
function setCollapsed(collapsed: boolean): void {
  panel.classList.toggle('collapsed', collapsed);
  collapseBtn.textContent = collapsed ? 'Controls' : 'Hide';
  collapseBtn.setAttribute('aria-expanded', String(!collapsed));
}
collapseBtn.addEventListener('click', () => setCollapsed(!panel.classList.contains('collapsed')));
if (window.matchMedia('(max-width: 640px)').matches) setCollapsed(true);

function toggleUi(): void {
  state.ui = !state.ui;
  document.body.classList.toggle('ui-hidden', !state.ui);
  saveHash();
}

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const flip = (k: (typeof TOGGLES)[number]) => {
    state[k] = !state[k];
    el[k].checked = state[k];
    el.captionBox.hidden = !state.caption;
    saveHash();
  };
  switch (e.key) {
    case ' ':
      togglePlay();
      break;
    case 'h': case 'H': toggleUi(); break;
    case 'l': case 'L': flip('lines'); break;
    case 'n': case 'N': flip('conNames'); break;
    case 's': case 'S': flip('starNames'); break;
    case 'g': case 'G': flip('grid'); break;
    case 'c': case 'C': flip('caption'); break;
    case 'r': case 'R': setRate(-clock.rate); break;
    case ']': setRate(stepRate(clock.rate, 1)); break;
    case '[': setRate(stepRate(clock.rate, -1)); break;
    case 'ArrowLeft': state.viewAz = (state.viewAz + 345) % 360; saveHash(); break;
    case 'ArrowRight': state.viewAz = (state.viewAz + 15) % 360; saveHash(); break;
    default:
      return;
  }
  e.preventDefault();
  (document.activeElement as HTMLElement | null)?.blur?.();
});

// URL edited by hand (or by a recording script): load it as a fresh shot.
window.addEventListener('hashchange', () => {
  state = parseHash(location.hash);
  clock.reset(state.t, state.rate, state.playing);
  simMs = state.t;
  syncControls();
});

// ---------- Dome interaction: drag to turn, hover for star details ----------

let drag: { id: number; angle: number } | null = null;

function screenAngle(x: number, y: number): number {
  const { cx, cy } = renderer.view;
  return (Math.atan2(x - cx, y - cy) * 180) / Math.PI;
}

canvas.addEventListener('pointerdown', (e) => {
  drag = { id: e.pointerId, angle: screenAngle(e.clientX, e.clientY) };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});

canvas.addEventListener('pointermove', (e) => {
  if (drag && e.pointerId === drag.id) {
    const a = screenAngle(e.clientX, e.clientY);
    // Keep the sky under the pointer: turning the pointer by Δ turns the view by −Δ.
    state.viewAz = (((state.viewAz - (a - drag.angle)) % 360) + 360) % 360;
    drag.angle = a;
    return;
  }
  hovered = state.ui ? renderer.hitTest(e.clientX, e.clientY) : null;
  showTooltip(e.clientX, e.clientY);
});

const endDrag = () => {
  if (!drag) return;
  drag = null;
  canvas.classList.remove('dragging');
  saveHash();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => {
  hovered = null;
  el.tooltip.hidden = true;
});

function showTooltip(x: number, y: number): void {
  if (!hovered) {
    el.tooltip.hidden = true;
    return;
  }
  const s = hovered;
  const alt = renderer.altitudeOf(s);
  const title = s.name ?? designation(s);
  const sub = s.name ? designation(s) : `HR ${s.hr}`;
  el.tooltip.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const line2 = document.createElement('div');
  line2.className = 'dim';
  line2.textContent = `${sub} · magnitude ${renderer.magnitudeOf(s).toFixed(2)}`;
  const line3 = document.createElement('div');
  line3.className = 'dim';
  line3.textContent = alt === null ? '' : `Altitude ${alt.toFixed(1)}°`;
  el.tooltip.append(strong, line2, line3);
  el.tooltip.hidden = false;
  const w = el.tooltip.offsetWidth;
  el.tooltip.style.left = `${Math.min(x + 14, window.innerWidth - w - 8)}px`;
  el.tooltip.style.top = `${y + 14}px`;
}

// ---------- Caption ----------

let lastCaption = '';
let lastTimeInput = '';
let lastZoneKey = '';
let zoneAbbr = '';

function updateReadouts(info: FrameInfo): void {
  // The zone abbreviation only changes with DST, so look it up at most once per simulated hour.
  const zoneKey = `${state.tz}|${Math.floor(simMs / 3600_000)}`;
  if (zoneKey !== lastZoneKey) {
    zoneAbbr = zoneAbbreviation(simMs, state.tz);
    lastZoneKey = zoneKey;
    el.tzLabel.textContent = `(${zoneAbbr})`;
  }
  if (state.caption) {
    const { date, time: clockTime } = formatLocalDate(simMs, state.tz);
    const time = `${date} · ${clockTime} ${zoneAbbr}`;
    const motion = clock.playing ? ` · ${clock.rate < 0 ? '◀' : '▶'} ${rateLabel(clock.rate)}` : '';
    const atLimit =
      simMs <= MIN_TIME_MS ? ` · earliest date shown (${RANGE_TEXT})` : simMs >= MAX_TIME_MS ? ` · latest date shown (${RANGE_TEXT})` : '';
    const sub = `${info.phase}${motion}${atLimit}`;
    const caption = `${state.place}|${time}|${sub}`;
    if (caption !== lastCaption) {
      lastCaption = caption;
      el.capPlace.textContent = state.place;
      el.capTime.textContent = time;
      el.capSub.textContent = sub;
    }
  }
  if (state.ui && document.activeElement !== el.time) {
    const v = formatLocalInput(simMs, state.tz);
    if (v !== lastTimeInput) {
      el.time.value = v;
      lastTimeInput = v;
    }
  }
}

// ---------- Frame loop ----------

declare global {
  interface Window {
    /** Read-only hooks for recording scripts. */
    nightSky?: { simTime: () => number; sunAltitude: () => number | null };
  }
}
window.nightSky = { simTime: () => simMs, sunAltitude: () => lastFrame?.sunAlt ?? null };

let wasPlaying = clock.playing;

function frame(ts: DOMHighResTimeStamp): void {
  simMs = clock.now(ts);
  if (clock.playing !== wasPlaying) {
    // The time-lapse ran into the end of the supported range and stopped.
    wasPlaying = clock.playing;
    syncPlayControls();
    saveHash();
  }
  lastFrame = renderer.draw(simMs, {
    lat: state.lat,
    lon: state.lon,
    viewAz: state.viewAz,
    lines: state.lines,
    conNames: state.conNames,
    starNames: state.starNames,
    grid: state.grid,
    highlight: hovered,
  });
  updateReadouts(lastFrame);
  if (!document.documentElement.dataset.ready) document.documentElement.dataset.ready = '1';
  requestAnimationFrame(frame);
}

syncControls();
requestAnimationFrame(frame);
