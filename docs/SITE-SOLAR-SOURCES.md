# Site solar calculation: sources and limits

`calculateSiteSolar` is an original implementation of the NOAA/Meeus Julian-century solar-position method, producing the geometric solar-centre direction. It is not a copy of NOAA's UI or a bundled SPA implementation. No dependency or network call is needed at runtime.

## Primary references consulted, 2026-10-11

- [NOAA calculation details](https://gml.noaa.gov/grad/solcalc/calcdetails.html): Meeus methodology, refraction distinction and limitations. NOAA says its calculator is no longer actively maintained. NOAA's 1901–2099 spreadsheet limit comes from its Julian-day approximation; the web method has a broader range. This module chooses **1901–2099 as a product boundary**, for both the supplied calendar year and resolved UTC year; it does not attribute that boundary to the web algorithm.
- [NOAA general equations PDF](https://gml.noaa.gov/grad/solcalc/solareqns.PDF): east-positive longitude, equation-of-time/clock offset conventions and hour-angle relation. Its fractional-year approximation is a **different approximation**; this module does not substitute its declination series for the Julian-century method.
- [NOAA main.js](https://gml.noaa.gov/grad/solcalc/main.js) was requested but **not successfully read** in this execution environment (web tool rejects JavaScript content; direct request returned HTTP403). The spreadsheet download also returned403. No claim is made that its current source bytes were inspected, copied or matched. Formula implementation must be assessed through independent equation review and reference tests rather than a claimed source-byte comparison.
- [Reda & Andreas, NREL/TP-560-34302, revised January2008](https://docs.nlr.gov/docs/fy08osti/34302.pdf): independent SPA reference. Appendix A.5/Table A5.1 gives the 2003-10-17,12:30:30 at UTC−07:00 sample, latitude39.742476, longitude−105.1786. Using its published topocentric declination−9.316179° and hour angle11.10629° in equation41 gives geometric elevation39.8720419048°. Its published azimuth is194.34024°. The published zenith50.11162° includes atmospheric refraction and is deliberately **not** used as a geometric elevation oracle. Test tolerance0.01° acknowledges algorithm/parallax differences; it is not a global accuracy guarantee. No NREL SPA source code is copied or redistributed.

## Equations and coordinates

UTC milliseconds determine Julian day and Julian centuries from J2000. Mean longitude, mean anomaly, eccentricity, equation of centre, apparent longitude, corrected obliquity, declination and equation of time follow the NOAA/Meeus method. UTC minutes plus equation of time plus four times east-positive longitude yields true solar time modulo1440; hour angle is true solar minutes/4−180°.

For latitude φ, declination δ and hour angle H:

```
E = −cosδ sinH
N = sinδ cosφ − cosδ cosH sinφ
U = sinφ sinδ + cosφ cosδ cosH
```

North angle A is true north clockwise from **plan +Y**. The geometry mapping is explicit:

```
planX = E cosA + N sinA
planY = −E sinA + N cosA
world = (planX, U, −planY)
```

Altitude uses atan2(U,hypot(E,N)); true azimuth uses atan2(E,N) wrapped to360°. A numerically vertical vector has null azimuth but remains valid, including a visible zenith sun. Ground displacement per metre of height is (−planX/U,−planY/U) when U>0. Night/horizon has no direct shadow. No low-altitude lift, display-length cap or decimal rounding is applied.

## Explicit input and uncertainty contract

Latitude/longitude and north angle must be finite numbers, including valid zeros; missing inputs never infer a city, location or north. `instant` accepts ISO calendar timestamps with an explicit `Z` or numeric `±HH:MM` offset, optional seconds and up to three fractional-second digits. Calendar rollovers, timezone-free strings, `-00:00` unknown offset,24:00 and leap seconds are rejected. Offset hour range is00–23 and minute00–59; this parses an explicit offset, not an IANA timezone or evidence that a civil zone exists. Equivalent offsets resolve to the same instant. No ambient local timezone is used.

No survey truth is asserted. Caller source metadata is retained as descriptive provenance with `inputVerified:false`. This geometric model omits atmospheric refraction, topocentric parallax, local terrain, neighbouring occluders and atmospheric/cloud irradiance. Direction is not a daylight/energy, regulatory or structural approval. Arbitrary near-horizon physical shadow lengths can greatly exceed a renderer's viewport or shadow-map bounds.

## Attribution and reuse

Equations and methodology are attributed to **NOAA Global Monitoring Laboratory, Boulder, Colorado, USA**, and its cited Meeus basis. See [GML disclaimer and terms](https://gml.noaa.gov/about/disclaimer.html): government-hosted material is public-domain unless otherwise marked, with attribution, no false ownership claim, no implied endorsement and no presentation of modified output as official government information. This application's code and output are independent; NOAA does not endorse or certify them. NREL's report is a cited numerical reference, not authorization to copy its separately distributed SPA software.

## Reference groups and coverage

The current 14-test suite separates three evidence groups:

1. **Independent published numeric reference:** one site/instant from NREL Table A5.1, comparing geometric elevation, azimuth and equation of time. The reviewed report has one complete solar-position example; NOAA's short general-equations PDF contains no additional numeric example. Multiple angles of this single fixture must not be called a multi-site accuracy survey.
2. **Method regression:** the implementation's NOAA/Meeus sample values39.87207442406391° elevation and194.34258286147943° azimuth are pinned to prevent accidental numerical drift. These values are **not an independently sourced oracle**.
3. **Geometric/input properties:** explicit north rotations0/90/180/270/360, unit vectors, both poles and ±89.999°, night/summer behavior, zenith null azimuth, long near-horizon shadows, equivalent timestamps, strict invalid calendars/offsets and inclusive1901/2099 UTC boundaries. These establish contract consistency and do not independently establish astronomical accuracy at every case.

A documented multi-site independent numerical benchmark remains outside the current evidence. No blocked NOAA download was bypassed, and no broader accuracy claim is made from these tests.
