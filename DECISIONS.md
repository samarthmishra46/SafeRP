# Decisions

Judgment calls made where the brief was ambiguous, with the reasoning behind each.

## Risk rules

- **Half-open ranges.** "25–34 mph" is read as `[25, 35)`, so 34.6 mph is Moderate. The edge asymmetry
  is kept exactly: wind is No Travel at `>= 55`, rain at `> 1.00`, snow at `> 3.0`.
- **Wind metric = gusts** (`WIND_METRIC=gust`, switchable to `sustained`). Gusts are what tip over
  high-profile trailers, and Open-Meteo's gust value is the maximum over the preceding hour, so it is the
  conservative choice. Both values are always shown in the UI.
- **Load rules only raise the wind level**, and the description of the rule that fired is shown only
  when wind is what drives the checkpoint level (otherwise it would explain a level it didn't cause).
- **All factors at the top level are reported as drivers** (e.g. "wind + rain") rather than picking one
  arbitrarily.
- **Rain rate = round(rain + showers, 4).** Without rounding, `0.07 + 0.03 = 0.09999…` would fall into
  Low instead of Moderate.
- **Missing forecast values** (Open-Meteo occasionally returns `null`) are treated as calm/dry and flagged
  on the checkpoint, rather than failing the whole plan.

## Forecast timing

- **Preceding-hour bucket for precipitation and gusts.** A value stamped 15:00 covers 14:00–15:00, so an
  ETA of 14:20 reads the 15:00 bucket; an ETA of exactly 15:00 also reads it.
- **Instantaneous values (sustained wind, direction, temperature) use the nearest hour**, since those are
  valid at their timestamp rather than over the hour.

## Miles and ranking

- **No Travel miles rank first**, ahead of Severe miles. The original list omits it, but a route crossing
  No Travel conditions must never beat one that doesn't just because it has fewer Severe miles.
- **Rounding before comparing** (miles 0.1, average risk 0.01, minutes 1). A complete tie keeps the
  routing engine's order, which is fastest first.
- **Recommendation text compares the winner with the runner-up** on the first ranking key that differs,
  then states the time difference.
- **Later-departure search** re-evaluates every route at +1 h … +12 h using the forecast series already
  fetched (each point's full 7-day series is cached), so it costs no extra API calls. It stops early if a
  shifted trip would run past the fetched forecast.

## Checkpoints

- A regular checkpoint within 0.5 mi (800 m) of the destination is merged into the destination checkpoint,
  which avoids two near-identical markers.
- Each checkpoint owns the stretch from the midpoint with its previous checkpoint to the midpoint with its
  next one; the first and last own to the route ends, so the spans tile the route exactly.
- **`TRUCK_SPEED_FACTOR` scales speed**, so durations are divided by it: `0.9` means the truck is 10%
  slower than Mapbox's car-based estimate. The default of 1.0 leaves Mapbox's durations unchanged.

## Routing

- **Three-route strategy.** First one request with `alternatives=true`, which gives up to 3 routes.
  Only if fewer than 3 survive filtering do we fire, in parallel, `exclude=motorway`, `exclude=toll`,
  and two silent via-points (`waypoints=0;2`) offset left and right of the fastest route's midpoint by
  15% of the straight-line distance (clamped to 15–120 km). Extras are best-effort and capped at
  6 seconds; a failing or slow extra never fails the plan.
- **Distinctness test.** Routes are rasterised onto ~120 m cells; a candidate is "too similar" if more
  than 80% of either route's length lies within one cell of the other. The check runs both ways, so a
  route that is a strict subset of another is also caught. Candidates over 1.6× the fastest duration are
  rejected. When 3 cannot be found, the response carries a notice saying why.
- **`max_weight`** = lb × 0.45359237 / 1000, rounded to 0.01 t and capped at Mapbox's documented 100 t
  (80,000 lb = 36.3 t, so the cap never binds in practice).
- **Annotations vs geometry.** Per-segment `distance`/`duration` annotations are used when they align
  with the geometry (they do, including across legs). If they ever don't, distances fall back to
  haversine and the route's total duration is spread by distance, the only place a constant speed is
  assumed.
- **Steps are requested but discarded** after parsing. The leg `summary` ("I 45 South, …") is kept as
  the route's "via" label.

## Weather

- **Forecast horizon = 168 h** (`FORECAST_HORIZON_HOURS`). Each point's series is fetched with
  `past_hours=2` and `forecast_hours=170`, so one cached series serves every plan, the later-departure
  search and the heatmap.
- **Cache key = run hour + coordinates rounded to 2 decimals**, TTL 30 min. Open-Meteo doesn't expose
  the model run time cheaply, so the current UTC hour stands in for it. Keys roll over hourly and data
  is never more than ~30 minutes stale.
- **Point budget.** A plan needing more than 500 distinct forecast points (`MAX_WEATHER_POINTS`) is
  refused with a 422 that suggests a wider interval. Open-Meteo weighs multi-location calls per
  location, and a coast-to-coast trip at 10 mi spacing would otherwise blow the 600/min free tier in
  one request.

## API

- **400 vs 422 vs 502.** Malformed or out-of-range input is 400. Valid input that can't be planned
  (no route, beyond the forecast horizon, too many points) is 422. Any third-party failure is 502 with
  the service named. All use `{"error": {"code", "message"}}`.
- **Departure slack = 10 minutes** in the past, so a form filled in slowly still submits.
- **Origin = destination** means within 500 m of each other.
- **Place search is limited to the US** (`GEOCODE_COUNTRY=us`, configurable). Pounds, mph and the
  80,000 lb ceiling (the US federal gross limit) all signal US trucking.
- **Geocoding cache (24 h)** stores Mapbox's temporary-geocoding results only to dedupe identical
  autocomplete keystrokes; they are never persisted beyond the cache TTL.
- **Response geometry** is simplified with Douglas–Peucker at 15 m (invisible at route-overview zooms),
  and coordinates are rounded to 5 decimals (~1 m). All calculations use the full geometry.
- **`HTTP_FORCE_IPV4`** (off by default) makes the backend resolve IPv4 only. The development machine's
  resolver stalled 15 s on AAAA lookups for every new connection.

## Heatmap

- **Backend grid, not weather tiles.** The corridor is the bounding box of all routes, buffered 30 mi.
  The spacing is the smallest of a fixed ladder (0.1°, 0.15°, 0.2° … 3°) that keeps the grid at or
  under 400 points. Points snap to multiples of the spacing, so overlapping corridors share
  coordinates and therefore cached forecasts.
- **Frame h covers the hour [now_hour + h, now_hour + h + 1)**, reading precipitation and gusts from
  the bucket that closes that hour. Slider hour 0 = "now", 48 frames ahead (49 values).
- **Rendered as blurred circles, not MapLibre's `heatmap` layer.** A heatmap layer colours by point
  density, which on a uniform grid confuses density with intensity. Circles coloured by value,
  radius scaled per zoom to one grid cell, show the actual forecast. Colours change at the risk
  thresholds (25/35/45/55 mph, etc.), with a faint tint below Moderate, so the heatmap and the
  checkpoints use the same visual language.
- **The slider swaps one hour's values** into the same GeoJSON source: no requests while scrubbing,
  toggling layers or playing (verified in a headless browser).
- **Truck markers** use each route's cumulative durations, so a truck slows where Mapbox expects
  slow traffic. A marker shows only between that route's departure and arrival.

## Frontend

- **Risk palette** is derived from Okabe–Ito (colour-blind safe). Every use pairs colour with
  something else: a text label, a level icon, a one-letter code inside map markers
  (L/M/H/S/X), marker size growing with level, and a dashed overlay on No Travel road segments.
- **Typeface pairing:** IBM Plex Sans for UI text, IBM Plex Mono for numbers (tabular figures), which
  suits a dispatch console. Self-hosted via `@fontsource`, so no third-party font CDN is needed.
- **State:** TanStack Query for server state (plan as a mutation; geocode and heatmap as cached
  queries). Small zustand stores hold the form and the UI selection, hover and timeline, so hovering
  a strip re-renders only what subscribes to it.
- **Map layers** are memoised style objects with long-lived GeoJSON sources whose `data` changes
  (react-map-gl calls `setData`), never recreated layers. Route lines draw beneath place labels;
  checkpoints draw above them.
- **The map is code-split** (MapLibre is ~290 KB gzipped) and wrapped in an error boundary, so the
  planner still works if WebGL is unavailable.
- **maplibre-gl 6 worker URL.** The library locates its worker relative to its own module URL, which
  Vite rewrites. The worker file is imported as a `?url` asset and passed to `setWorkerUrl`.
- **Form errors appear after the first submit**, then update live, so nobody is shouted at while
  still typing. The form mirrors the backend's validation so most mistakes never reach the server.
- **Results replace the form with a one-line trip summary** and an Edit button, which keeps the
  route cards above the fold.
- **The staged progress indicator** advances on typical timings, since the plan is a single
  request. It's honest about stages, not percentages.
- **Weight presets** (15k / 35k / 45k / 80k) land in different load-rule bands: below 30k, 30–40k,
  above 40k, and the legal maximum.

## Deployment

- **Both apps deploy to Vercel**, as two projects from one repository (root directories `backend`
  and `frontend`). As of this writing, Vercel's Python runtime detects Django from `manage.py`, allows
  500 MB bundles (this one is a few MB), and runs up to 300 s on Hobby with Fluid compute; a cold
  plan takes ~3–10 s. `maxDuration` is set to 60 s.
- **Redis via Upstash** (Vercel Marketplace). Integration versions name the URL differently, so
  the settings accept `REDIS_URL` or `KV_URL`.
  Without either, each function instance has its own in-memory cache, which still works but shares
  less.
- **The frontend calls the API cross-origin** via `VITE_API_BASE_URL`. CORS is restricted to the
  configured origins, plus an optional regex for preview deployments.
- **Silenced Django deploy checks**: CSRF (no cookie auth), SSL redirect and HSTS (terminated and
  sent by the platform). The reasons are commented in `settings.py`.

## Forecast slider (upgrade)

- **Slider hours are whole forecast hours.** Hour h is the time `anchor + h`, where the anchor is the
  current UTC hour from the heatmap. It shows the forecast frame covering that hour. Before, hour 0
  was "the moment the grid loaded", which put truck time and weather frame up to 59 minutes apart.
  The label is weekday + 24-hour local time ("Tue 14:00") plus "+N h". In half-hour time zones the
  minutes read :30, because the forecast hours are UTC hours.
- **Playback speeds 1×/2×/4× = 1, 2 or 4 forecast hours per second. Playback stops at +48 h** rather
  than looping. A loop would jump silently from two days out back to "now", which is easy to
  misread. Pressing Play at the end restarts from hour 0.
- **The Departure button jumps to the first whole hour at or after departure**, so the truck is
  already on the map. It is disabled, with a tooltip, when departure is beyond the 48-hour window.
  The track marks departure and arrival of the selected route (the recommended route by default).
- **The hazard timeline uses the same ETA forecast as the recommendation.** Each checkpoint owns the
  time from the midpoint of its ETA with the previous checkpoint to the midpoint with the next,
  mirroring how it owns miles. An hour is coloured by the worst level among checkpoints whose time
  overlaps it. Hours off the road are left blank. All-Low hours are drawn faint so trouble stands out.
- **Dragging is throttled to animation frames.** The thumb follows the pointer through local state;
  the store, and therefore the map, updates at most once per frame. Keyboard and the final position
  commit immediately. MUI's slider already handled the arrow keys and Home/End, and they are now
  covered by tests.
- **The slider never changes risk or the recommendation.** This is stated in a tooltip, in the
  slider's accessible description, and in a short caption on desktop.
- **Truck markers stay as DOM markers** (at most three, one per route; the selected one is filled
  with the accent colour). Their position comes from `truckPositionAtHour`, which follows Mapbox's
  per-segment durations.
- **The dev proxy target is configurable** (`API_PROXY_TARGET`, default `http://127.0.0.1:8000`), so a
  second dev stack can run beside the usual one.

## Weather animations

- **What is animated.** At the slider hour, each route checkpoint shows its dominant hazard, and
  each corridor grid point shows the selected heatmap layer, but only where the level is Moderate
  or higher. The selected route is drawn at full opacity, the others at 45%. Grid symbols appear
  only while the heatmap is visible.
- **Levels come from the backend, using the risk-table thresholds only, without load rules.**
  The animations describe the weather at a place and time, not one truck's risk. Classifying in
  Python (`core/domain/hazards.py`, reusing `wind_level`/`rain_level`/`snow_level`) keeps a single
  implementation of the thresholds instead of a TypeScript copy.
- **Compact encoding.** Each hour is one string with one digit per point per factor (e.g. `"0012"`).
  Wind direction is rounded to 10°. For Dallas → Chicago, gzipped sizes grew as follows:

  | Response | Before | After |
  | --- | --- | --- |
  | Plan, 10-mi interval (195 checkpoints) | 48.2 KB | 53.8 KB |
  | Plan, 25-mi interval | 35.5 KB | 38.4 KB |
  | Heatmap (361 points) | 26.5 KB | 39.0 KB |

  Caching is unchanged (same TTLs and key scheme). The heatmap cache key is versioned (`heat2`) so
  payloads cached in the old shape are never served.
- **Plan and heatmap hours are aligned by their anchors.** The two can be fetched in different
  UTC hours, so the frontend offsets the plan's hourly data by the difference.
- **Dominant hazard:** the highest level wins. Ties go to snow, then rain, then wind, because
  precipitation also cuts visibility and traction.
- **Wind direction:** Open-Meteo reports where the wind comes FROM. The icon is drawn blowing east and
  turned with `icon-rotate = from + 90` (map-aligned), so it points where the wind blows TO.
- **Rendering:**
  - Twelve animated images per theme (3 types × 4 levels), registered on demand through
    MapLibre 6's `setMissingStyleImageResolver`, which also re-creates them in the new colours
    after a theme change. In MapLibre 6 the `styleimagemissing` event can no longer supply images.
  - Each is a `StyleImageInterface` whose `render()` redraws a 56 px canvas (28 px at 2×).
  - Particle count and size grow with the level, and `icon-size` adds to that. Colours are the
    risk palette with a thin dark outline, so yellow stays legible on the light basemap.
  - Symbols are thinned by collision detection: higher levels are placed first via
    `symbol-sort-key`, and route symbols have priority over grid symbols. They are also capped
    at 120 route and 90 grid symbols.
- **Frame pacing.** One `WeatherClock` per map advances a frame counter at 24 fps and calls
  `triggerRepaint()` only when the counter advances. `render()` returns `true` only when it
  actually redrew. The loop stops entirely when there are no hazard symbols, the tab is hidden,
  the map is off screen (IntersectionObserver), animations are off, or reduced motion is
  preferred. Under reduced motion the icons show a static frame.
- **The toggle hides the weather symbols** rather than freezing them. "Off" should declutter the
  map; reduced motion is the case for static icons. The choice is stored in `localStorage`
  (`saferp:weather-animations`).
- **The map button is a native MapLibre control** (via `useControl`), stacked under the zoom
  buttons, with `aria-pressed` and a label that says what it will do.
- **Legend glyphs** are drawn by the same `drawHazard` function as the map icons, so they always
  match.

## Performance check (slider + animations)

Measured with Playwright driving Chrome on the machine's GPU (Intel Iris Xe via ANGLE/Vulkan,
1440×900), Dallas → Chicago at a 10-mi interval. Hazards were injected at every checkpoint and grid
point, so the symbol caps were always hit (worst case). Frame times come from a
`requestAnimationFrame` recorder and long tasks from `PerformanceObserver`.

**What profiling found, and what was fixed:**
1. **The whole map re-rendered on every slider hour.** MapView and TimelineBar subscribed to the
   hour, so each step re-rendered every Source/Layer (react-map-gl deep-compares their props) and the
   whole bar. The hour-dependent parts now live in small subscriber components
   (`map/HourLayers.tsx`, `HourScrubber`, `PlayButton`, `LayerControls`).
2. **Pixel-array icon updates were premultiplied in JavaScript for every tile's icon atlas on
   every frame.** This was the top self-time function while animating. The canvas is now handed to
   the GPU through MapLibre's `StyleImageWebGLData.renderWithWebGL`: one `texSubImage2D` per atlas
   slot, premultiplied by the driver, with no `getImageData`. `render()` still redraws the small
   canvas only when the frame advances.
3. **`formatSliderTime` built a new `Intl.DateTimeFormat` per call.** It is now cached. Keyboard
   steps go through the same once-per-frame commit as dragging.

**Results on the production build, before → after the fixes, animations on:**

| Scenario | Frames > 50 ms | p95 frame time | Long tasks | CPU |
| --- | --- | --- | --- | --- |
| Playback at 4×, 48 h | 27 → **0** | 50 → 16.8 ms | 49 → **0** | 74 → 55% |
| Mouse drag across the track | 2 → **0** (one 83 ms frame) | 16.8 ms | 2 → **0** | 38 → 39% |
| Keyboard stress, a step every 40 ms (2 × 48 steps) | 88 → **2** | 83 → 33 ms | 98 → **0** | 100% |
| Idle with icons animating | **0** | 16.8 ms (60 fps) | 0 | 25 → **13%** |

The "before" column is from the development build, the only build profiled before the fixes.
Like for like, the development build after the fixes measured: playback 0 frames over 50 ms,
keyboard stress 17 frames over 50 ms (max 100 ms) with 9 long tasks, and idle 15% CPU. With
animations off, the same idle measures 3% CPU. The remaining keyboard-stress spikes come from
MapLibre re-laying out the symbol tiles for the new hour's sources; normal dragging and playback
do not hit them.

- **Pausing:** with the tab hidden, under reduced motion, or with animations toggled off, idle CPU
  drops to 2–7%. The loop is stopped, not just skipped.
- **Memory:** after a warm-up playback, 16 more play + scrub cycles left DOM nodes (804) and event
  listeners (691) unchanged. The JS heap levelled off: 21.68 → 22.07 → 22.36 → 22.38 MB at cycles
  4/8/12/16. Growth was the same with animations off (+1.36 MB vs +1.46 MB over 8 cycles), so it
  is cache warm-up, not a leak.
- **Network:** 0 requests during scrubbing, dragging, layer toggles and playback.
- **Not covered:** software rendering. Under SwiftShader (no GPU), every repaint takes ~300 ms
  with or without animations. A machine without GPU acceleration should switch the animations
  off; they stay off once switched.
