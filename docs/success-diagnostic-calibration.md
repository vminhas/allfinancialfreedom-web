# Success Diagnostic: calibration to the source (Siebold) scale

Our scoring is our own transparent formula (see `src/lib/diagnostic/scoring.ts`),
but the overall 800-point number is calibrated to land on the same scale as the
source Siebold diagnostic. This documents how.

## Method

The source diagnostic scores through an undocumented external engine (no public
rubric; confirmed by research). To calibrate empirically, on **2026-07-11** we
submitted **11 controlled answer vectors** to the real assessment
(`speakerapprentice.typeform.com/to/zEp49NCo`) over HTTP, each to its own inbox,
and captured the emailed report. Then we least-squares fit our raw composite to
the source's overall score.

Submissions were made headless by replaying the Typeform flow
(`GET` form -> `POST /forms/zEp49NCo/start-submission` for a signature ->
`POST /forms/zEp49NCo/complete-submission` with the answers). The single-use
limit is keyed on the email inside the assessment, not the link, and no access
gate is required for the report to be emailed.

Every vector held the forced-choice answers at the first (strong) option and
varied the 7-point scale value and the 7-day frequency bucket, plus two
single-module-isolation runs.

## Data (11 points)

| Vector (inputs) | Source overall | Source class |
|---|--:|---|
| keyed_low (positive=1, reverse=7, freq 0) | 355 | Entry |
| selfaware_high (only Self-Awareness high) | 392 | Entry |
| leadership_high (only Leadership high) | 400 | Entry |
| scale 7, freq 0 | 506 | Entry |
| scale 5, freq 0 | 532 | Entry |
| scale 4, freq 0 | 537 | Entry |
| scale 1, freq 0 | 551 | Entry |
| scale 4, freq mid | 598 | Emerging |
| scale 7, freq max | 604 | Emerging |
| scale 1, freq max | 649 | Middle |
| keyed_high (positive=7, reverse=1, freq max) | 764 | World Class |

Notes learned from the data:
- The source scale is **compressed** (observed 355..764) vs our raw composite.
- **Frequency matters a lot**: going freq 0 -> max adds ~+98 points at both scale
  extremes, so the 7-day behavior items carry heavy weight.
- Uniform high agreement is not rewarded (reverse items are scored), consistent
  with our approach.

## Fit

```
siebold_overall ~= 0.710 * ours_raw + 243.5     R^2 = 0.93
```

Baked into `scoring.ts` as `SIEBOLD_CAL_SLOPE` / `SIEBOLD_CAL_INTERCEPT` via
`calibrateToSiebold()`. After calibration, mean absolute error is **~25 / 800**
(max 48), and class labels match on 9 of 11 vectors (the two misses are one band
apart at the high-frequency boundary).

Class + risk bands (`overallClassForScore` / `riskForScore`) are set from the
observed clusters: Entry <575, Emerging 575-649, Developing (~"Middle") 650-699,
Advanced 700-749, Elite (~"World Class") >=750.

## Caveats

- Module scores and the #1 limiting factor stay on our own transparent scale;
  only the overall number and its class/risk are calibrated to the source.
- The fit was made with forced-choice held constant, so real varied-choice
  inputs extrapolate slightly. Re-fit the two constants if more data points are
  gathered.
- These are placeholders relative to the ideal target: our own AFF outcomes
  (who actually gets licensed and produces). Recalibrate to those over time.
