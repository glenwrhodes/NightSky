// Draws the dome on a 2D canvas: sky colour, twilight glow, grid, constellation figures, stars,
// the Sun, labels and the compass ring.

import { apply, normalize, type Vec3 } from '../astro/math';
import { skyFrame } from '../astro/coords';
import { skyPhase, sunJ2000, type SkyPhase } from '../astro/sun';
import { julianDateTT } from '../astro/time';
import type { Catalog, Star } from '../sky/catalog';
import type { Figure } from '../sky/constellations';
import { CatalogMotion } from '../sky/motion';
import { fitDome, makeVecProjector, project, type DomeView, type Point } from '../sky/projection';
import {
  darkness,
  extinction,
  limitingMagnitude,
  rgba,
  skyColors,
  starAlpha,
  starColor,
  starRadius,
  twilightGlow,
} from './look';

export interface RenderOptions {
  lat: number;
  lon: number;
  viewAz: number;
  lines: boolean;
  conNames: boolean;
  starNames: boolean;
  grid: boolean;
  highlight: Star | null;
}

export interface FrameInfo {
  sunAlt: number;
  phase: SkyPhase;
}

const COLOR_BUCKETS = 24;
const BV_MIN = -0.4;
const BV_MAX = 2.0;
const SPRITE = 64;
/** The sprite's bright core is this fraction of its half-width. */
const CORE = 0.2;
/** Space for the compass letters around the dome, CSS pixels. */
const MARGIN = 34;

function makeSprite(bv: number | null): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const g = c.getContext('2d')!;
  const h = SPRITE / 2;
  const col = starColor(bv);
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(CORE * 0.6, rgba(col, 1));
  grad.addColorStop(CORE, rgba(col, 0.75));
  grad.addColorStop(CORE * 2, rgba(col, 0.16));
  grad.addColorStop(1, rgba(col, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, SPRITE, SPRITE);
  return c;
}

function bucketOf(bv: number | null): number {
  if (bv === null) return COLOR_BUCKETS; // the extra white sprite
  const t = (Math.min(BV_MAX, Math.max(BV_MIN, bv)) - BV_MIN) / (BV_MAX - BV_MIN);
  return Math.round(t * (COLOR_BUCKETS - 1));
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stars: Star[];
  private readonly motion: CatalogMotion;
  /** Star directions (J2000 frame) and magnitude changes at `vecEpoch`. */
  private readonly vecs: Float64Array;
  private readonly dmag: Float32Array;
  private vecEpoch = NaN;
  private readonly bucket: Uint8Array;
  private readonly index = new Map<Star, number>();
  private readonly sprites: HTMLCanvasElement[] = [];
  // Per-frame results, kept for hit testing and line drawing.
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly palt: Float32Array;
  private readonly pvis: Float32Array;
  private width = 1;
  private height = 1;
  private dpr = 1;
  view: DomeView = { cx: 0, cy: 0, radius: 1, viewAz: 180 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    catalog: Catalog,
    private readonly figures: Figure[],
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.stars = catalog.stars;
    const n = this.stars.length;
    this.motion = new CatalogMotion(this.stars);
    this.vecs = new Float64Array(n * 3);
    this.dmag = new Float32Array(n);
    this.bucket = new Uint8Array(n);
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.palt = new Float32Array(n);
    this.pvis = new Float32Array(n);
    this.stars.forEach((s, i) => {
      this.bucket[i] = bucketOf(s.bv);
      this.index.set(s, i);
    });
    for (let b = 0; b < COLOR_BUCKETS; b++) {
      this.sprites.push(makeSprite(BV_MIN + ((BV_MAX - BV_MIN) * b) / (COLOR_BUCKETS - 1)));
    }
    this.sprites.push(makeSprite(null));
    this.resize();
  }

  /** Match the canvas backing store to its CSS size and the device pixel ratio. */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  draw(unixMs: number, o: RenderOptions): FrameInfo {
    this.resize();
    const { ctx, width: W, height: H } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const view: DomeView = { ...fitDome(W, H, MARGIN), viewAz: o.viewAz };
    this.view = view;
    const { cx, cy, radius: R } = view;
    const scale = R / 500;

    const frame = skyFrame(unixMs, o.lat, o.lon);
    // Stars move by at most a few arcseconds a year, so only recompute after ~9 hours of sky time.
    if (!(Math.abs(frame.epoch - this.vecEpoch) < 1e-3)) {
      this.motion.at(frame.epoch - 2000, this.vecs, this.dmag);
      this.vecEpoch = frame.epoch;
    }
    const sunVec = apply(frame.j2000ToHorizon, sunJ2000(julianDateTT(frame.jd)));
    const projectVec = makeVecProjector(view);
    const sunPt: Point = { x: 0, y: 0 };
    const sunAlt = projectVec(sunVec, sunPt);
    const dark = darkness(sunAlt);
    const limit = limitingMagnitude(sunAlt);

    // Room around the dome.
    ctx.fillStyle = '#020307';
    ctx.fillRect(0, 0, W, H);
    const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.25);
    halo.addColorStop(0, 'rgba(40,60,110,0.10)');
    halo.addColorStop(1, 'rgba(40,60,110,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // Sky: zenith colour in the middle, horizon colour at the rim.
    const sky = skyColors(sunAlt);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, rgba(sky.zenith));
    g.addColorStop(0.55, rgba(sky.zenith.map((v, i) => (v * 2 + sky.horizon[i]) / 3) as Vec3));
    g.addColorStop(1, rgba(sky.horizon));
    ctx.fillStyle = g;
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);

    // Warm glow around the Sun, even when it is below the horizon (its point is then off the dome).
    const glow = twilightGlow(sunAlt);
    if (glow > 0.01) {
      const tg = ctx.createRadialGradient(sunPt.x, sunPt.y, 0, sunPt.x, sunPt.y, R * 1.3);
      tg.addColorStop(0, `rgba(255,160,85,${0.75 * glow})`);
      tg.addColorStop(0.35, `rgba(235,115,85,${0.3 * glow})`);
      tg.addColorStop(1, 'rgba(200,90,90,0)');
      ctx.fillStyle = tg;
      ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    }

    if (o.grid) this.drawGrid(view, dark, o.lat);

    // Project every star once; lines and hit testing reuse the results.
    const out: Point = { x: 0, y: 0 };
    const v = new Float64Array(3);
    const m = frame.j2000ToHorizon;
    const vecs = this.vecs;
    for (let i = 0; i < this.stars.length; i++) {
      const x = vecs[i * 3];
      const y = vecs[i * 3 + 1];
      const z = vecs[i * 3 + 2];
      v[0] = m[0] * x + m[1] * y + m[2] * z;
      v[1] = m[3] * x + m[4] * y + m[5] * z;
      v[2] = m[6] * x + m[7] * y + m[8] * z;
      this.palt[i] = projectVec(v, out);
      this.px[i] = out.x;
      this.py[i] = out.y;
    }

    if (o.lines && dark > 0.02) this.drawFigureLines(dark, scale);

    // Stars, faintest first so bright ones sit on top.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.stars.length - 1; i >= 0; i--) {
      this.pvis[i] = 0;
      const alt = this.palt[i];
      if (alt < 0) continue;
      const mag = this.stars[i].mag + this.dmag[i] + extinction(alt);
      const a = starAlpha(mag, limit);
      if (a <= 0) continue;
      this.pvis[i] = a;
      const r = Math.max(0.35, starRadius(mag) * scale);
      const half = r / CORE;
      ctx.globalAlpha = a;
      ctx.drawImage(this.sprites[this.bucket[i]], this.px[i] - half, this.py[i] - half, half * 2, half * 2);
    }
    ctx.globalAlpha = 1;

    if (sunAlt > -1) this.drawSun(sunPt, scale);
    ctx.globalCompositeOperation = 'source-over';

    // Labels: first-magnitude star names, then constellation names, then the other star names.
    // Each skips (or moves) to avoid overlapping what is already there and the dome's edge.
    const labels = new LabelBoxes(view);
    if (o.starNames) this.drawStarNames(scale, labels, -2, 1.6);
    if (o.conNames && dark > 0.02) this.drawFigureNames(frame.j2000ToHorizon, projectVec, dark, labels);
    if (o.starNames) this.drawStarNames(scale, labels, 1.6, 2.6);
    if (o.highlight) this.drawHighlight(o.highlight, scale);

    ctx.restore();
    this.drawRim(view);
    return { sunAlt, phase: skyPhase(sunAlt) };
  }

  /** The visible star nearest to a CSS-pixel point, within a few pixels. */
  hitTest(x: number, y: number): Star | null {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < this.stars.length; i++) {
      if (this.pvis[i] < 0.25) continue;
      const d = Math.hypot(this.px[i] - x, this.py[i] - y);
      if (d > 12) continue;
      const score = d + this.stars[i].mag * 1.2; // prefer brighter stars when close
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best < 0 ? null : this.stars[best];
  }

  /** A star's altitude in the last frame drawn. */
  altitudeOf(star: Star): number | null {
    const i = this.index.get(star);
    return i === undefined ? null : this.palt[i];
  }

  /** A star's magnitude at the date of the last frame (it changes as nearby stars move). */
  magnitudeOf(star: Star): number {
    const i = this.index.get(star);
    return i === undefined ? star.mag : star.mag + this.dmag[i];
  }

  private drawGrid(view: DomeView, dark: number, lat: number): void {
    const { ctx } = this;
    const { cx, cy, radius: R } = view;

    // The celestial pole of date: the point the sky turns around. It always sits at altitude =
    // latitude, due north (south pole due south for southern observers); precession moves the
    // stars past it.
    if (Math.abs(lat) > 0.5) {
      const p = lat > 0 ? project(lat, 0, view) : project(-lat, 180, view);
      const r = 7;
      ctx.strokeStyle = `rgba(255,200,130,${0.55 + 0.3 * dark})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.moveTo(p.x - r * 1.8, p.y);
      ctx.lineTo(p.x - r * 0.5, p.y);
      ctx.moveTo(p.x + r * 0.5, p.y);
      ctx.lineTo(p.x + r * 1.8, p.y);
      ctx.moveTo(p.x, p.y - r * 1.8);
      ctx.lineTo(p.x, p.y - r * 0.5);
      ctx.moveTo(p.x, p.y + r * 0.5);
      ctx.lineTo(p.x, p.y + r * 1.8);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,205,150,${0.5 + 0.3 * dark})`;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(lat > 0 ? 'North celestial pole' : 'South celestial pole', p.x + r * 2.2, p.y + r * 1.6);
    }

    ctx.strokeStyle = `rgba(130,160,215,${0.1 + 0.1 * dark})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    for (const alt of [30, 60]) {
      ctx.beginPath();
      ctx.arc(cx, cy, (R * (90 - alt)) / 90, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let az = 0; az < 360; az += 30) {
      const a = project(80, az, view);
      const b = project(0, az, view);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(150,175,225,${0.35 + 0.2 * dark})`;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const alt of [30, 60]) {
      const p = project(alt, view.viewAz + 15, view);
      ctx.fillText(`${alt}°`, p.x + 3, p.y);
    }
  }

  private drawFigureLines(dark: number, scale: number): void {
    const { ctx } = this;
    ctx.strokeStyle = `rgba(110,150,220,${0.42 * dark})`;
    ctx.lineWidth = Math.max(0.8, 1.1 * scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const gap = 5 * scale;
    for (const f of this.figures) {
      for (const [sa, sb] of f.segments) {
        const ia = this.index.get(sa)!;
        const ib = this.index.get(sb)!;
        if (this.palt[ia] < -5 && this.palt[ib] < -5) continue;
        const ax = this.px[ia];
        const ay = this.py[ia];
        const dx = this.px[ib] - ax;
        const dy = this.py[ib] - ay;
        const len = Math.hypot(dx, dy);
        if (len < gap * 2.5) continue;
        // Leave a small gap around each star, like a planetarium projector's figures.
        const t = gap / len;
        ctx.moveTo(ax + dx * t, ay + dy * t);
        ctx.lineTo(ax + dx * (1 - t), ay + dy * (1 - t));
      }
    }
    ctx.stroke();
  }

  private drawFigureNames(
    m: Float64Array,
    projectVec: (v: Vec3 | Float64Array, out: Point) => number,
    dark: number,
    labels: LabelBoxes,
  ): void {
    const { ctx } = this;
    const p: Point = { x: 0, y: 0 };
    ctx.font = '600 11px system-ui, sans-serif';
    setLetterSpacing(ctx, '3px');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(150,180,235,${0.6 * dark})`;
    const { cx, cy } = this.view;
    for (const f of this.figures) {
      // Label at the middle of the figure's own stars, where they are at this date.
      const sum: Vec3 = [0, 0, 0];
      for (const s of f.members) {
        const j = this.index.get(s)! * 3;
        for (let k = 0; k < 3; k++) sum[k] += this.vecs[j + k];
      }
      const alt = projectVec(apply(m, normalize(sum)), p);
      if (alt < 2) continue;
      const text = f.name.toUpperCase();
      const w = ctx.measureText(text).width;
      // Near the rim, slide the label towards the centre until it fits inside the dome.
      let x = p.x;
      let y = p.y;
      const d = Math.hypot(x - cx, y - cy) || 1;
      for (let k = 0; k < 12 && !labels.inside(x - w / 2, y - 7, w, 14); k++) {
        x -= ((x - cx) / d) * 6;
        y -= ((y - cy) / d) * 6;
      }
      // If it collides, try just below or above before giving up.
      const placed = [0, 14, -14].find((dy) => labels.place(x - w / 2, y + dy - 7, w, 14));
      if (placed === undefined) continue;
      ctx.fillText(text, x, y + placed);
    }
    setLetterSpacing(ctx, '0px');
  }

  /** Names of stars with magnitude in [minMag, maxMag), right of the star or else left of it. */
  private drawStarNames(scale: number, labels: LabelBoxes, minMag: number, maxMag: number): void {
    const { ctx } = this;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const gap = 6 + 4 * scale;
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      if (s.mag >= maxMag) break; // stars are brightest-first, so brighter names win any overlap
      if (s.mag < minMag || !s.name || this.pvis[i] < 0.35 || this.palt[i] < 2) continue;
      const w = ctx.measureText(s.name).width;
      const y = this.py[i] + 1;
      const right = this.px[i] + gap;
      const left = this.px[i] - gap - w;
      const x = labels.place(right, y - 7, w, 14) ? right : labels.place(left, y - 7, w, 14) ? left : null;
      if (x === null) continue;
      ctx.fillStyle = `rgba(215,225,245,${0.8 * this.pvis[i]})`;
      ctx.fillText(s.name, x, y);
    }
  }

  private drawHighlight(star: Star, scale: number): void {
    const i = this.index.get(star);
    if (i === undefined || this.palt[i] < 0) return;
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(255,214,120,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this.px[i], this.py[i], 7 + 3 * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawSun(p: Point, scale: number): void {
    const { ctx } = this;
    const r = Math.max(4, 6 * scale);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 8);
    g.addColorStop(0, 'rgba(255,250,235,1)');
    g.addColorStop(0.12, 'rgba(255,240,200,0.95)');
    g.addColorStop(0.3, 'rgba(255,220,160,0.25)');
    g.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 8, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawRim(view: DomeView): void {
    const { ctx } = this;
    const { cx, cy, radius: R } = view;
    ctx.strokeStyle = 'rgba(150,175,225,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // Tick marks every 10°, longer every 30°.
    ctx.strokeStyle = 'rgba(150,175,225,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let az = 0; az < 360; az += 10) {
      const len = az % 30 === 0 ? 7 : 3.5;
      const a = project(0, az, view);
      const b = project(-(len * 90) / R, az, view);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    ctx.font = '600 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labels: [string, number][] = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
    for (const [label, az] of labels) {
      const p = project(-(20 * 90) / R, az, view);
      ctx.fillStyle = label === 'N' ? 'rgba(255,190,120,0.95)' : 'rgba(180,200,240,0.85)';
      ctx.fillText(label, p.x, p.y);
    }
  }
}

/** Screen rectangles already taken by labels, so later labels can skip overlaps. */
class LabelBoxes {
  private boxes: number[] = [];

  constructor(private readonly view: DomeView) {}

  /** Whether a box lies fully inside the dome (with a small margin). */
  inside(x: number, y: number, w: number, h: number): boolean {
    const { cx, cy, radius } = this.view;
    const r = radius - 4;
    const fits = (px: number, py: number) => Math.hypot(px - cx, py - cy) <= r;
    return fits(x, y) && fits(x + w, y) && fits(x, y + h) && fits(x + w, y + h);
  }

  /**
   * Reserve a box if it is inside the dome and doesn't overlap one already placed.
   * Returns whether it was placed.
   */
  place(x: number, y: number, w: number, h: number, pad = 3): boolean {
    if (!this.inside(x, y, w, h)) return false;
    const b = this.boxes;
    for (let i = 0; i < b.length; i += 4) {
      if (x < b[i + 2] + pad && x + w + pad > b[i] && y < b[i + 3] + pad && y + h + pad > b[i + 1]) return false;
    }
    b.push(x, y, x + w, y + h);
    return true;
  }
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = value;
}
