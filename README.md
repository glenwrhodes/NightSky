# Night Sky

[![CI](https://github.com/glenwrhodes/NightSky/actions/workflows/ci.yml/badge.svg)](https://github.com/glenwrhodes/NightSky/actions/workflows/ci.yml)

A planetarium in the browser: the real sky for any place and time, shown on a dome.

- 9,096 naked-eye stars from the Yale Bright Star Catalogue, with true colours and brightness
- Alt-azimuth view for any latitude, longitude and moment from **13,000 BC to AD 17,000**, with
  long-term precession and the stars' own motions, so the pole stars change as they really do
  (Thuban in 2800 BC, Polaris today, Vega around AD 13,600)
- Constellation figures for 43 constellations, with names
- Time-lapse forwards or backwards, from real time to a sidereal day per second
- "Same time each night" time-lapse: the clock time stays put and the date steps (a day to a
  thousand years per step), so the stars drift through the seasons, or through the centuries until
  the pole moves
- The sky brightens through twilight into day, with the Sun's glow on the horizon

TypeScript, HTML canvas and Vite. No runtime dependencies and no network needed.

Continuous integration: every push and pull request runs the typecheck, the unit tests and the
production build on GitHub Actions (`.github/workflows/ci.yml`). It only checks; nothing is
released or deployed.

## Start it

```
npm start
```

That installs dependencies on the first run and serves the app at http://localhost:5173.

Other commands: `npm test` (unit tests), `npm run typecheck`, `npm run build` (production build into
`dist/`), `npm run build:catalog` (rebuild the star data, see `src/data/README.md`).

## Controls

Drag the dome to turn it. Hover a star for its name, magnitude and altitude.

| Key | Action |
| --- | --- |
| Space | Play / pause the time-lapse |
| M | Switch between continuous and "same time each night" |
| `[` / `]` | Slower / faster (continuous), or smaller / bigger steps (same time each night) |
| R | Reverse direction |
| H | Hide / show the controls |
| L, N, S, G, C | Toggle lines, constellation names, star names, grid (with the celestial pole), caption |
| ← / → | Turn the dome 15° |

## Setting up a shot from the URL

Everything about a view lives in the URL hash, and the app keeps it up to date as you use it.
Copy the URL to come back to the same shot. With no hash you get the default scene:
Mauna Kea, Hawaii at 9 pm on 20 January 2027, with Orion high in the south.

```
http://localhost:5173/#loc=maunakea&t=2027-01-20T18:30&rate=600&play=1&ui=0
```

| Parameter | Meaning | Default |
| --- | --- | --- |
| `loc` | Preset place: `maunakea`, `atacama`, `namibrand`, `tekapo`, `cherrysprings`, `jasper`, `tromso`, `toronto`, `london`, `sydney`, `quito`, `northpole`, `southpole` | `maunakea` |
| `lat`, `lon` | Custom location in degrees (north and east positive). Overrides `loc` | |
| `tz` | IANA time zone for local times, such as `Asia/Tokyo`. Custom locations default to whole-hour solar time | the place's zone |
| `place` | Name shown in the caption | the place's name |
| `t` | Start time: local wall-clock time at the place (`2027-01-20T21:00`), ISO with `Z` or an offset, Unix milliseconds, or `now`. Years may be negative: `-2829-06-21T21:00` is 2830 BC (year 0 = 1 BC). Times outside 13,000 BC – AD 17,000 are moved to the nearest end of that range | `2027-01-20T21:00` |
| `rate` | Continuous time-lapse speed in simulated seconds per real second; negative runs backwards (`600` = 10 min/s, `3600` = 1 hour/s) | `600` |
| `mode` | `continuous`, or `nightly` for "same time each night" | `continuous` |
| `step` | Nightly mode: date step, a whole number of `d` (days), `w` (weeks), `mo` (months) or `y` (years): `1d`, `1mo`, `100y`, `12053d`. Negative steps go back in time (`-100y`) | `1d` |
| `sps` | Nightly mode: steps per second, 0.1 to 120 | `10` |
| `play` | `1` to start the time-lapse running | `0` |
| `az` | Compass direction at the bottom of the dome, degrees (`180` = South, `0` = North) | `180` |
| `lines`, `names`, `stars`, `grid`, `caption` | `1` / `0`: constellation lines, constellation names, star names, altitude grid with the celestial pole marked, place-and-time caption | `1`,`1`,`1`,`0`,`1` |
| `ui` | `0` hides the control panel (for recording) | `1` |

Invalid values are ignored and fall back to the defaults. Changing the hash on a loaded page restarts
the shot from the new settings.

A time-lapse that reaches either end of the range stops there, and the caption says
"earliest date shown" or "latest date shown". Dates use the proleptic Gregorian calendar (the one
JavaScript uses), so ancient dates differ by days from the Julian-calendar dates in history books.
Before standard time zones existed, local times are the zone city's local mean time
(Honolulu: UTC−10:31:26).

Example shots across the range:

```
#loc=northpole&t=-2799-12-21T00:00Z&ui=0        Thuban at the zenith, 2800 BC
#loc=northpole&t=13600-12-21T00:00Z&ui=0        Vega near the zenith, AD 13,600
```

### Same time each night

In this mode the local clock time stays put and the date steps forward (or back) by `step`, `sps`
times a second. Each step is a separate moment, so the sky moves in steps rather than smoothly.
With one-day steps the stars drift through the seasons. With steps of decades or centuries the
seasons stay put and precession takes over: the pole moves through the stars.

- **Calendar steps** (`1mo`, `1y`, `100y`, …) keep the calendar date: Jan 31 + 1 month is Feb 28,
  and Feb 29 + 1 year is Feb 28. Every step is counted from where stepping started, so nothing
  drifts.
- **The leap-year wobble.** The number of days in N calendar years changes with leap days, and at a
  fixed clock time each extra or missing day turns the whole sky by about 1°. Year steps therefore
  wobble: for 10-year steps the sky zigzags about 2° every step.
- **Fixed-day steps are smooth.** `12053d` is 33 Gregorian years to within 0.003 days. It turns the
  sky by exactly the same amount every step and keeps the calendar date to within a day over
  10,000 years. It is in the controls as "12,053 days (≈ 33 years)".
- **Limits.** Stepping stops on its last step inside 13,000 BC – AD 17,000, with the same "latest /
  earliest date shown" note. It runs off the page clock like the continuous time-lapse: step
  k = ⌊elapsed seconds × `sps`⌋, so the same moment shows the same step at any frame rate.

**The pole moving from Polaris to Vega** (about 15 s, then it holds at AD 16,975):

```
http://localhost:5173/#loc=northpole&t=2026-12-21T00:00Z&mode=nightly&step=12053d&sps=30&play=1&grid=1&ui=0
```

This is the sky from the North Pole at midnight UTC each 21 December, 33 years per step at 30 steps
a second. The zenith is the celestial pole, marked by the grid's pole cross. Polaris starts on it,
swings away after AD 2100, and Vega comes within 5.7° around AD 13,600 (about 11.7 s in). It is
polar night throughout. `tests/stepping.test.ts` checks all of this.

### Recording with a headless browser

- **Timing:** the time-lapse runs only off the page's own clock (`requestAnimationFrame`
  timestamps on the `performance.now()` timeline). Nothing reads `Date.now()` except `t=now`. A
  recorder that controls or virtualises the page clock therefore gets the same frames every time.
- **Start time:** the clock anchors on the first frame drawn, so that frame shows exactly the `t`
  from the URL.
- **Ready signal:** `<html data-ready="1">` is set once the first frame has been drawn.
- **Read-only hooks:** `window.nightSky.simTime()` returns the simulated time (Unix ms) and
  `window.nightSky.sunAltitude()` returns the Sun's altitude in degrees.
- **Resolution:** the canvas follows the viewport size and `devicePixelRatio` (up to 3), so set
  the viewport and device scale factor to the video size you want.

## How it works

```
src/
  astro/    maths only, no DOM. Time scales (Earth rotation angle, ΔT, the supported range),
            long-term precession, the CIO, equatorial → horizontal, the Sun
  sky/      the star catalogue, star motions, star names, constellation figures, the dome projection
  render/   look.ts: star colour from B−V, sizes, sky colour and limiting magnitude by Sun altitude,
            atmospheric extinction; renderer.ts: draws the dome on a canvas
  app/      time-lapse clock (continuous and stepped), "same time each night" date stepping,
            URL state, time zones, places, speeds
  main.ts   wires it together: controls, keyboard, drag and hover, frame loop
tests/      Vitest unit tests; tests/reference/ holds the old IAU 1976 model for cross-checks
```

For each frame:

1. **Stars move.** Each star moves in a straight line from its J2000 position using its catalogue
   proper motion. Where there is a parallax the motion is in 3-D, including radial velocity, so nearby
   stars also brighten or fade.
2. **One matrix takes J2000 directions to the local horizon.** It combines three things:
   - **Precession:** Vondrák, Capitaine & Wallace (2011), valid for ±200,000 years.
   - **The Earth's rotation:** the IAU 2000 Earth rotation angle, measured from the celestial
     intermediate origin (CIO), whose locator *s* is integrated numerically from the precessing pole.
   - **The observer's latitude and longitude.**
3. **The Sun** uses dynamical time (clock time plus ΔT) and lies on the ecliptic of date.
4. **The dome:** everything goes through an azimuthal equidistant projection. The zenith is in the
   centre and the horizon is the rim, like a planetarium dome master.

The core is tested against:

- the IAU SOFA/ERFA library's published test values for long-term precession and the Earth
  rotation angle
- Meeus's worked examples: Julian Date (7.a), alt-az coordinates (13.b), precession (21.b, matched
  to under 1″) and the Sun (25.a)
- the classical sidereal-time pipeline, matched to 2″ from 1900 to 2100
- known pole stars across the range (`tests/polestars.test.ts`)

## Accuracy and date range

The app covers **13,000 BC to AD 17,000**. You can't set or time-lapse outside it: URLs are clamped
and a running time-lapse stops at either end.

**Why the range changed.** The first version used the IAU 1976 precession polynomials (Meeus
ch. 21) with the IAU 1982 sidereal-time formula, and ignored the stars' own motions. Those
polynomials are fits for a few centuries around 2000. This table compares that old pipeline with the
current long-term model. It shows the worst error among bright stars above the horizon:

| Date | Old pipeline error |
| --- | --- |
| AD 1000 – AD 3000 | under 2″ |
| 3000 BC / AD 6000 | 2.5′ / 1.3′ |
| 5000 BC / AD 10,000 | 14′ / 38′ |
| 8000 BC | 1.5° |
| AD 14,000 | 4.7° |
| 13,000 BC / AD 17,000 | 12° / 14° |

Ignoring proper motion mattered sooner. The fastest bright stars move up to a degree per thousand
years: Alpha Centauri was already a degree out by AD 1000 and AD 3000, and Arcturus over half a
degree. Together with precession, that's why Vega came out at 82.4° above the North Pole in
AD 14,000; the current model gives 83.8°.

**What limits the range now:**

- **Precession** holds for ±200,000 years, so it is not the limit.
- **The stars' motions** are modelled as straight lines from catalogue proper motions. Given typical
  proper-motion errors of about 0.01″ a year, that should hold to a few arcminutes over this span
  for most stars (an estimate, not a measurement). Much further out, stars' paths curve and
  stars outside the catalogue would become naked-eye stars.
- **The Sun** is placed by dynamical time, so it depends on ΔT (how far the Earth's rotation has
  drifted). ΔT is known to seconds today but is uncertain by many hours this far from the present.
  Near the ends of the range the Sun's position along the ecliptic, and so the calendar date of
  the seasons, can be off by up to a few days. Star positions at a given clock time don't depend
  on ΔT.

**About Vega:** it comes closest to the pole around AD 13,600, at about 5.7°. Figures of "4–5°" assume
today's 23.4° tilt of the Earth's axis. The tilt will then be near its minimum (about 22.6°), and the
closest approach is 90° − Vega's ecliptic latitude (61.7°) − 22.6°. A test checks this.

### Deliberately left out (for now)

The Moon, planets, the Milky Way, deep-sky objects, atmospheric refraction, nutation and the
aberration of starlight. Nutation and aberration are each under 21″, which can't be seen at dome
scale.

## Data

See `src/data/README.md`. Star data comes from the Yale Bright Star Catalogue. The constellation
figures were drawn for this project.

---

© 2026 Tiny Moosh Games Inc.
