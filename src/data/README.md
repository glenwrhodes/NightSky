# Star data

`bsc5.json` is generated from the **Yale Bright Star Catalogue, 5th Revised Edition**
(Hoffleit & Warren 1991, Astronomical Data Center / CDS catalogue V/50). It is distributed freely
by the CDS and the NASA Astronomical Data Center and is generally treated as public domain;
we credit it here as the CDS asks.

- 9,096 stars (the catalogue's 9,110 entries minus 14 novae and non-stellar objects with no position)
- J2000.0 positions, V magnitude, B−V colour index, Flamsteed number, Bayer letter, constellation
- Downloaded from the Harvard-Smithsonian Telescope Data Center mirror
  (`http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz`), which serves the same 197-byte records as CDS

Rebuild it with `npm run build:catalog`. The script checks the byte layout against Sirius,
Betelgeuse and Polaris before writing anything.

Fields per star, in order: `hr, raDeg, decDeg, vmag, bv, flamsteed, bayer, con`.

Not taken from any other project:

- **Constellation figures** (`src/sky/constellations.ts`) were drawn for Night Sky as lists of
  catalogue designations. Tests check every star exists, is brighter than magnitude 5.5 and that no
  line is longer than 30°.
- **Star names** (`src/sky/starNames.ts`) are the common IAU-approved names of bright stars.
