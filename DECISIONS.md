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
