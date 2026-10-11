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
