# Loom walkthrough (≈8–9 minutes)

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

## 4:45 – 5:45 · Forecast slider and weather animations

- With a plan loaded, click **Departure**. The slider jumps to the departure hour and the trucks
  appear at the origin. Point at the thin **hazard timeline** above the track: each hour is
  coloured by the worst risk the truck on the selected route meets, and the Dep/Arr ticks bracket
  the trip.
- Press **Play** at **2×**. Narrate: rain streaks, drifting snow and downwind wind streaks appear and
  fade along the routes and across the corridor as the hours pass, in the same risk colours, and
  bigger and denser at higher levels. The selected route is full strength; the others are dimmed.
- Switch the heatmap layer to Rain, then Snow; the corridor animations follow the layer.
- Hover the ⓘ next to the time: the slider explores weather only, and the route risk and
  recommendation always use each checkpoint's ETA forecast.
- Keyboard: focus the slider and use the arrows and Home/End. Then click the cloud button under
  the zoom controls to switch animations off, and reload to show the choice is remembered.
- One line on performance: one animated image per hazard type and level, drawn on a small canvas
  at 24 fps and handed to the GPU. The loop sleeps when the tab is hidden or nothing is animating,
  and the Network tab stays empty while scrubbing.

## (+45 s) · Optional rest stops

- Edit the trip, tick **Plan rest stops**, and click the **US** preset: 30 min after 8 h, 10 h after
  11 h. Then show that every part is optional: switch the overnight rest off and on, and change
  the break to every 4 h. The presets just fill in values; nothing is enforced.
- Re-plan Dallas → Chicago. The cards now show "With stops 25 h 9 min", "1 break · 1 overnight
  rest", and the later arrival. Point out the ☕ and 🌙 markers on the map.
- Press **Departure** and play. The truck parks at the break and then overnight (its icon
  changes), and the hazard strip is hatched for the rest hours. Since stops shift the ETAs, the
  checkpoint forecasts, and therefore the risk, are those of the real arrival times.

## 5:45 – 7:00 · The logic (code)

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

## 7:00 – 7:45 · Engineering choices

- Domain layer is pure (a test fails if it imports Django or does I/O); services do I/O in a thread
  pool with a shared session (timeouts, one retry) and per-point weather caching (2-decimal
  coordinates + forecast hour, 30 min).
- Errors: one JSON shape; 400 invalid, 422 unplannable, 502 upstream with the service named.
- Frontend: TanStack Query, memoised layers, in-place GeoJSON updates, code-split map, axe check at
  0 violations.

## 7:45 – 8:15 · Wrap up

- Limitations: car-based durations, weather only sampled at checkpoints, 7-day horizon,
  Open-Meteo free-tier rate limits.
- Pointer to DECISIONS.md for every judgment call, and DEPLOY.md for Vercel + Upstash setup.
