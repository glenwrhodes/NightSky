// The star catalogue: Yale Bright Star Catalogue (BSC5), J2000 positions. See src/data/README.md.

import raw from '../data/bsc5.json';
import { sphericalToVec, type Vec3 } from '../astro/math';
import { PROPER_NAMES } from './starNames';

export interface Star {
  hr: number;
  ra: number;
  dec: number;
  mag: number;
  /** B−V colour index; null where the catalogue has none. */
  bv: number | null;
  flamsteed: number;
  /** Bayer letter as in the catalogue ("Alp", "Mu", "Bet1"), or "" if none. */
  bayer: string;
  con: string;
  /** J2000 equatorial unit vector, at epoch J2000.0. */
  vec: Vec3;
  /** Proper motion in RA (× cos dec) and in Dec, arcsec per year. */
  pmRA: number;
  pmDE: number;
  /** Parallax in arcsec, or null where the catalogue has none. */
  plx: number | null;
  /** Radial velocity in km/s, or null. */
  rv: number | null;
  /** Proper name (Sirius, Vega, ...) if it has a well-known one. */
  name?: string;
}

type Row = [
  number, number, number, number, number | null, number, string, string,
  number, number, number | null, number | null,
];

const GREEK: Record<string, string> = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ',
  Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π',
  Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
};
const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

/** Human-readable designation: "α Ori", "α¹ Cen", "58 Per" or "HR 1234". */
export function designation(star: Pick<Star, 'hr' | 'bayer' | 'flamsteed' | 'con'>): string {
  if (star.bayer) {
    const m = /^([A-Za-z]+)(\d?)$/.exec(star.bayer);
    if (m && GREEK[m[1]]) {
      const sup = m[2] ? SUPERSCRIPT[Number(m[2])] : '';
      return `${GREEK[m[1]]}${sup} ${star.con}`;
    }
  }
  if (star.flamsteed) return `${star.flamsteed} ${star.con}`;
  return `HR ${star.hr}`;
}

export class Catalog {
  /** All stars, brightest first. */
  readonly stars: Star[];
  private readonly byHr = new Map<number, Star>();
  private readonly byKey = new Map<string, Star>();

  constructor(rows: Row[]) {
    this.stars = rows
      .map(([hr, ra, dec, mag, bv, flamsteed, bayer, con, pmRA, pmDE, plx, rv]) => ({
        hr, ra, dec, mag, bv, flamsteed, bayer, con, pmRA, pmDE, plx, rv, vec: sphericalToVec(ra, dec),
      }))
      .sort((a, b) => a.mag - b.mag);
    // Stars are brightest-first, so when components share a designation the brightest wins.
    const addKey = (key: string, s: Star) => {
      if (!this.byKey.has(key)) this.byKey.set(key, s);
    };
    for (const s of this.stars) {
      this.byHr.set(s.hr, s);
      if (s.bayer) addKey(`${s.bayer} ${s.con}`, s);
      if (s.flamsteed) addKey(`${s.flamsteed} ${s.con}`, s);
    }
    for (const [key, name] of Object.entries(PROPER_NAMES)) {
      const star = this.find(key);
      if (star) star.name = name;
    }
  }

  byNumber(hr: number): Star | undefined {
    return this.byHr.get(hr);
  }

  /**
   * Look a star up by designation: "Alp Ori", "Bet1 Cyg", "23 UMa".
   * If a Bayer letter without a number is not found but numbered components exist
   * ("Alp Cen" → α¹, α²), the brightest component is returned.
   */
  find(key: string): Star | undefined {
    const exact = this.byKey.get(key);
    if (exact) return exact;
    const m = /^([A-Za-z]+) ([A-Za-z]{3})$/.exec(key);
    if (!m) return undefined;
    let best: Star | undefined;
    for (let i = 1; i <= 9; i++) {
      const s = this.byKey.get(`${m[1]}${i} ${m[2]}`);
      if (s && (!best || s.mag < best.mag)) best = s;
    }
    return best;
  }
}

let cached: Catalog | undefined;
export function loadCatalog(): Catalog {
  cached ??= new Catalog(raw.stars as Row[]);
  return cached;
}
