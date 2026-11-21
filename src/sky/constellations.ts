// Constellation stick figures, drawn for this project. Each figure is a list of polylines; each
// point is a catalogue designation inside that constellation ("Alp", "Bet1", "23"), or a full
// designation with another constellation ("Bet Tau") where a figure borrows a star.

import type { Catalog, Star } from './catalog';
import { normalize, type Vec3 } from '../astro/math';

export interface FigureDef {
  abbr: string;
  name: string;
  lines: string[][];
}

export const FIGURES: FigureDef[] = [
  // Northern / circumpolar
  { abbr: 'UMa', name: 'Ursa Major', lines: [
    ['Eta', 'Zet', 'Eps', 'Del', 'Alp', 'Bet', 'Gam', 'Del'],
    ['Gam', 'Chi', 'Nu', 'Xi'],
    ['Chi', 'Psi', 'Mu', 'Lam'],
  ] },
  { abbr: 'UMi', name: 'Ursa Minor', lines: [['Alp', 'Del', 'Eps', 'Zet', 'Bet', 'Gam', 'Eta', 'Zet']] },
  { abbr: 'Cas', name: 'Cassiopeia', lines: [['Eps', 'Del', 'Gam', 'Alp', 'Bet']] },
  { abbr: 'Cep', name: 'Cepheus', lines: [['Alp', 'Bet', 'Gam', 'Iot', 'Zet', 'Alp']] },
  { abbr: 'Dra', name: 'Draco', lines: [
    ['Bet', 'Gam', 'Xi', 'Nu', 'Bet'],
    ['Xi', 'Del', 'Zet', 'Eta', 'The', 'Iot', 'Alp', 'Kap', 'Lam'],
  ] },
  { abbr: 'Cyg', name: 'Cygnus', lines: [
    ['Alp', 'Gam', 'Eta', 'Bet'],
    ['Kap', 'Iot', 'Del', 'Gam', 'Eps', 'Zet'],
  ] },
  { abbr: 'Lyr', name: 'Lyra', lines: [['Eps', 'Alp', 'Zet', 'Bet', 'Gam', 'Del', 'Zet']] },
  { abbr: 'Her', name: 'Hercules', lines: [
    ['Zet', 'Eta', 'Pi', 'Eps', 'Zet'],
    ['Zet', 'Bet', 'Gam'],
    ['Eps', 'Del'],
  ] },
  { abbr: 'CrB', name: 'Corona Borealis', lines: [['The', 'Bet', 'Alp', 'Gam', 'Del', 'Eps', 'Iot']] },
  { abbr: 'Boo', name: 'Boötes', lines: [['Alp', 'Eps', 'Del', 'Bet', 'Gam', 'Rho', 'Alp', 'Eta'], ['Alp', 'Zet']] },
  { abbr: 'CVn', name: 'Canes Venatici', lines: [['Alp', 'Bet']] },
  { abbr: 'Com', name: 'Coma Berenices', lines: [['Alp', 'Bet', 'Gam']] },
  { abbr: 'Per', name: 'Perseus', lines: [
    ['Eta', 'Gam', 'Alp', 'Del', 'Eps', 'Xi', 'Zet'],
    ['Alp', 'Kap', 'Bet', 'Rho'],
  ] },
  { abbr: 'Aur', name: 'Auriga', lines: [['Alp', 'Bet', 'The', 'Bet Tau', 'Iot', 'Alp']] },
  { abbr: 'And', name: 'Andromeda', lines: [['Alp', 'Del', 'Bet', 'Gam'], ['Bet', 'Mu', 'Nu']] },
  { abbr: 'Peg', name: 'Pegasus', lines: [
    ['Alp', 'Bet', 'Alp And', 'Gam', 'Alp'],
    ['Alp', 'Zet', 'The', 'Eps'],
    ['Bet', 'Mu', 'Lam'],
    ['Bet', 'Eta'],
  ] },
  { abbr: 'Tri', name: 'Triangulum', lines: [['Alp', 'Bet', 'Gam', 'Alp']] },
  { abbr: 'Ari', name: 'Aries', lines: [['41', 'Alp', 'Bet', 'Gam']] },
  { abbr: 'Del', name: 'Delphinus', lines: [['Alp', 'Bet', 'Del', 'Gam', 'Alp'], ['Bet', 'Eps']] },
  { abbr: 'Sge', name: 'Sagitta', lines: [['Gam', 'Del', 'Alp'], ['Del', 'Bet']] },
  { abbr: 'Aql', name: 'Aquila', lines: [['Zet', 'Gam', 'Alp', 'Bet', 'The'], ['Alp', 'Del', 'Lam']] },

  // Zodiac
  { abbr: 'Tau', name: 'Taurus', lines: [['Bet', 'Eps', 'Del', 'Gam', 'The', 'Alp', 'Zet']] },
  { abbr: 'Gem', name: 'Gemini', lines: [
    ['Alp', 'Tau', 'Eps', 'Mu', 'Eta'],
    ['Bet', 'Ups', 'Del', 'Zet', 'Gam'],
    ['Tau', 'Iot', 'Ups'],
  ] },
  { abbr: 'Cnc', name: 'Cancer', lines: [['Iot', 'Gam', 'Del', 'Bet'], ['Del', 'Alp']] },
  { abbr: 'Leo', name: 'Leo', lines: [
    ['Eps', 'Mu', 'Zet', 'Gam', 'Eta', 'Alp', 'The', 'Bet', 'Del', 'Gam'],
    ['Del', 'The'],
  ] },
  { abbr: 'Vir', name: 'Virgo', lines: [['Bet', 'Eta', 'Gam', 'Alp'], ['Gam', 'Del', 'Eps'], ['Alp', 'Zet', 'Del']] },
  { abbr: 'Lib', name: 'Libra', lines: [['Alp', 'Bet', 'Gam', 'Alp'], ['Alp', 'Sig']] },
  { abbr: 'Sco', name: 'Scorpius', lines: [
    ['Bet', 'Del', 'Pi'],
    ['Del', 'Sig', 'Alp', 'Tau', 'Eps', 'Mu', 'Zet', 'Eta', 'The', 'Iot', 'Kap', 'Lam', 'Ups'],
  ] },
  { abbr: 'Sgr', name: 'Sagittarius', lines: [
    ['Gam', 'Del', 'Eps', 'Gam'],
    ['Del', 'Lam', 'Phi', 'Del'],
    ['Eps', 'Zet', 'Phi', 'Sig', 'Tau', 'Zet'],
  ] },
  { abbr: 'Cap', name: 'Capricornus', lines: [['Alp', 'Bet', 'Psi', 'Ome', 'Zet', 'Del', 'Gam', 'Iot', 'The', 'Bet']] },

  // Winter and equatorial
  { abbr: 'Ori', name: 'Orion', lines: [
    ['Alp', 'Gam'],
    ['Alp', 'Zet', 'Eps', 'Del', 'Gam'],
    ['Zet', 'Kap', 'Bet', 'Del'],
    ['Alp', 'Lam', 'Gam'],
  ] },
  { abbr: 'CMa', name: 'Canis Major', lines: [['Bet', 'Alp', 'Omi', 'Del', 'Eta'], ['Del', 'Eps', 'Zet']] },
  { abbr: 'CMi', name: 'Canis Minor', lines: [['Alp', 'Bet']] },
  { abbr: 'Lep', name: 'Lepus', lines: [['Eps', 'Mu', 'Alp', 'Bet', 'Eps'], ['Alp', 'Zet', 'Eta', 'Del', 'Gam', 'Bet']] },
  { abbr: 'Cet', name: 'Cetus', lines: [
    ['Bet', 'Iot'],
    ['Bet', 'Eta', 'The', 'Zet', 'Tau', 'Bet'],
    ['Zet', 'Omi', 'Del', 'Gam', 'Alp'],
  ] },
  { abbr: 'Hya', name: 'Hydra', lines: [
    ['Del', 'Sig', 'Eta', 'Rho', 'Eps', 'Del'],
    ['Eps', 'Zet', 'The', 'Iot', 'Alp', 'Ups', 'Lam', 'Mu', 'Nu', 'Xi', 'Bet', 'Gam', 'Pi'],
  ] },
  { abbr: 'Crv', name: 'Corvus', lines: [['Gam', 'Del', 'Bet', 'Eps', 'Gam'], ['Eps', 'Alp']] },
  { abbr: 'Oph', name: 'Ophiuchus', lines: [['Alp', 'Kap', 'Del', 'Eps', 'Zet', 'Eta', 'Nu', 'Bet', 'Alp']] },

  // Southern
  { abbr: 'Cru', name: 'Crux', lines: [['Alp', 'Gam'], ['Bet', 'Del']] },
  { abbr: 'Cen', name: 'Centaurus', lines: [['Alp', 'Bet', 'Eps', 'Zet', 'Eta', 'The'], ['Eps', 'Gam', 'Del']] },
  { abbr: 'Car', name: 'Carina', lines: [['Alp', 'Eps', 'Iot', 'The', 'Bet', 'Eps']] },
  { abbr: 'Vel', name: 'Vela', lines: [['Gam', 'Del', 'Kap', 'Phi', 'Mu', 'Psi', 'Lam', 'Gam']] },
  { abbr: 'TrA', name: 'Triangulum Australe', lines: [['Alp', 'Bet', 'Gam', 'Alp']] },
];

export interface Figure {
  abbr: string;
  name: string;
  /** Pairs of stars to join. */
  segments: [Star, Star][];
  /** Unit vector (J2000) at the middle of the figure, for its label. */
  labelVec: Vec3;
}

/** Turn a figure point into a catalogue key: "Alp" in Ori → "Alp Ori"; "Bet Tau" stays. */
export function figureKey(point: string, con: string): string {
  return point.includes(' ') ? point : `${point} ${con}`;
}

/** Resolve all figures against the catalogue. Throws if any point does not resolve. */
export function resolveFigures(catalog: Catalog, defs: FigureDef[] = FIGURES): Figure[] {
  return defs.map((def) => {
    const segments: [Star, Star][] = [];
    const members = new Set<Star>();
    for (const line of def.lines) {
      const stars = line.map((p) => {
        const s = catalog.find(figureKey(p, def.abbr));
        if (!s) throw new Error(`${def.name}: no star "${figureKey(p, def.abbr)}"`);
        return s;
      });
      for (let i = 1; i < stars.length; i++) segments.push([stars[i - 1], stars[i]]);
      for (const s of stars) if (s.con === def.abbr) members.add(s);
    }
    const sum: Vec3 = [0, 0, 0];
    for (const s of members) for (let k = 0; k < 3; k++) sum[k] += s.vec[k];
    return { abbr: def.abbr, name: def.name, segments, labelVec: normalize(sum) };
  });
}
