# Loom walkthrough (≈8 minutes)

Have open beforehand: the deployed app (or `npm run dev` + `runserver`), `backend/core/domain/risk.py`,
`backend/core/domain/evaluate.py`, `backend/tests/test_risk.py`, and DECISIONS.md.

## 0:00 – 0:45 · What it is

- "SafeRP plans truck trips around the weather. Enter origin, destination, departure and load. It
  returns up to three routes, scores each stretch of road for wind, rain and snow at the time the
  truck actually gets there, and recommends one with a reason a dispatcher can repeat."
- Point out the layout: full-bleed map, planner panel on the left, forecast timeline at the bottom.

## 0:45 – 2:30 · Plan a trip (happy path)

- Type "Dallas" in origin and show the debounced autocomplete; pick it. Destination "Chicago".
  Show the swap button.
- Departure: next hour. Weight: click **Heavy · 45k** and mention that the presets sit in different
  load-rule bands. Interval: 25 mi.
- Click **Plan routes** and narrate the staged progress (routes → checkpoints → forecasts → scoring).
- On results: the trip summary line, the recommendation sentence, and the route cards (distance,
  drive time, arrival, worst level, miles per level).
- If only 2 routes come back, read the notice: overlap above 80% or more than 1.6× the fastest
  time gets rejected.

## 2:30 – 3:45 · Map ↔ card interaction

- Hover along a card's **risk strip** and show the matching checkpoint highlighted on the map with
  its popover (ETA, sustained wind, gusts in bold because risk uses gusts, rain, snow, level, and
  the factor that drove it).
- Arrow keys on the strip step through checkpoints; Enter pins the popover; Escape clears it
  (keyboard support).
- Click a muted route on the map to select it; the cards follow.
- Point at the legend: colour plus a letter code, marker size growing with level, and a dashed
  overlay for No Travel, so nothing relies on colour alone.

## 3:45 – 4:45 · Heatmap and timeline

- Toggle **Wind / Rain / Snow**; the colour scale changes at the same thresholds as the risk rules.
- Drag the slider and press **Play**; truck markers move along each route at their ETAs.
- Mention: the backend sends the grid once with 49 hourly frames, so scrubbing makes zero network
  requests (open DevTools → Network to show it).
- Switch to dark mode with the header toggle.

## 4:45 – 6:30 · The logic (code)

- `risk.py`: half-open thresholds, the >=55 vs >1.00 / >3.0 asymmetry, load rules, and
  max-of-factors with reported drivers.
- `test_risk.py`: parametrised boundary tests at every edge (24.9/25, …, 3.0/3.01) and 30,000/30,001
  and 40,000/40,001 lb.
- `checkpoints.py` / `geo.py`: ETAs interpolated from Mapbox per-segment durations (not constant
  speed); midpoint mile ownership.
- `ranking.py`: lexicographic key with No Travel first and rounding before comparison; `explain()`
  builds the sentence.
- `evaluate.py`: if even the best route has No Travel miles, re-run at +1…+12 h against the
  already-fetched forecast series and suggest the first that clears.
- Show the **No Travel banner** with its **Use N h later** button (if no live storm is available,
  explain it from the test `test_plan_storm_marks_not_recommended_and_suggests_departure`).

## 6:30 – 7:30 · Engineering choices

- Domain layer is pure (a test fails if it imports Django or does I/O); services do I/O in a thread
  pool with a shared session (timeouts, one retry) and per-point weather caching (2-decimal
  coordinates + forecast hour, 30 min).
- Errors: one JSON shape; 400 invalid, 422 unplannable, 502 upstream with the service named.
- Frontend: TanStack Query, memoised layers, in-place GeoJSON updates, code-split map, axe check at
  0 violations.

## 7:30 – 8:00 · Wrap up

- Limitations: car-based durations, weather only sampled at checkpoints, 7-day horizon,
  Open-Meteo free-tier rate limits.
- Pointer to DECISIONS.md for every judgment call, and DEPLOY.md for Vercel + Upstash setup.
