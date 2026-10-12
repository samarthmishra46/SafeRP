# Deploying SafeRP

**Recommended setup (all free):**

- **Backend** (Django API) → **Render** free web service, from the `render.yaml` Blueprint in this
  repo.
- **Keep-alive** → **cron-job.org** pings `/api/health` every 10 minutes, so the free service never
  goes to sleep. A GitHub Actions workflow in this repo is a backup pinger.
- **Frontend** (React app) → **Vercel**.

Why the ping is needed: Render puts a free web service to sleep after **15 minutes without
traffic**, and the next request then waits up to about a minute while it wakes. A month has at most
744 hours and Render gives each workspace **750 free instance hours** a month, so one always-on
service fits within the free tier. A second always-on free service would not.

You need: this repo on GitHub, a Mapbox access token (account.mapbox.com → Tokens; the default
public `pk.` token is fine), and free accounts on Render, Vercel and cron-job.org.

---

## 1. Backend on Render

1. Sign in at **dashboard.render.com** with GitHub.
2. Click **New +** → **Blueprint**. Connect your GitHub account if asked, and pick the **SafeRP**
   repository. Render finds `render.yaml` at the repo root.
3. Render lists one service, **saferp-api** (Free plan), and asks for the values marked secret:
   - `MAPBOX_ACCESS_TOKEN`: your Mapbox token.
   - `CORS_ALLOWED_ORIGINS`: your frontend URL. You don't know it yet, so enter
     `http://localhost:5173` for now; you'll change it in step 4.
   - `REDIS_URL`: leave empty. It's optional (see "Optional: Redis" below).

   `DJANGO_SECRET_KEY` is generated for you, `DJANGO_DEBUG` is set to `false`, and
   `HTTP_FORCE_IPV4` is set to `true`. Without it, each call to Mapbox stalls about 15 s on
   Render's IPv6 DNS lookups.

   Paste **only the token itself** (`pk.eyJ…`): not `MAPBOX_ACCESS_TOKEN=`, and no quotes. The
   backend now strips those, but it's best to enter the bare value.
4. Click **Apply** / **Deploy Blueprint**. The first build takes a few minutes.
5. When it shows **Live**, copy the service URL, e.g. `https://saferp-api.onrender.com`.
6. Open `https://saferp-api.onrender.com/api/health`. You should see
   `{"status":"ok","mapboxConfigured":true,...}`.

If the Blueprint import fails, create the service by hand: **New + → Web Service** → this repo,
with these settings:
- **Root Directory:** `backend`.
- **Runtime:** Python.
- **Instance type:** Free.
- **Build and start commands:** copy `buildCommand` and `startCommand` from `render.yaml`.
- **Health Check Path:** `/api/health`.
- **Environment:** add the variables from step 3, plus `DJANGO_SECRET_KEY` with any long random
  string.

**Python version.** Render uses `backend/.python-version` (3.12) if it reads it, and otherwise its
default (3.14). The test suite passes on both. To pin a version, add a `PYTHON_VERSION`
environment variable with a full version number such as `3.12.11`.

## 2. Keep the backend awake (free cron job)

**Primary: cron-job.org**

1. Create a free account at **cron-job.org** and confirm your email.
2. **Dashboard → Create cronjob**:
   - **Title:** `SafeRP keep-alive`.
   - **URL:** `https://saferp-api.onrender.com/api/health` (your URL from step 1).
   - **Execution schedule:** *Every 10 minutes*.
   - Under **Advanced**, set the request timeout to the maximum. A sleeping service can take up
     to a minute to answer.
   - Optionally, turn on failure notifications.
3. Click **Create**. After a few runs, the job history should show HTTP **200** responses.

**Backup: GitHub Actions** (already in this repo: `.github/workflows/keep-backend-awake.yml`)

1. On GitHub, open the repo → **Settings → Secrets and variables → Actions → Variables** →
   **New repository variable**.
2. Name: `BACKEND_URL`. Value: `https://saferp-api.onrender.com` (no trailing slash).
3. Open **Actions → Keep backend awake → Run workflow** once to check it succeeds.

It runs every 10 minutes and is free because the repo is public. GitHub may run scheduled jobs a few
minutes late, and it pauses scheduled workflows after 60 days without commits to the repo. That's
why cron-job.org is the primary pinger.

The pings only call `/api/health`, which is cheap and exempt from rate limits. They don't touch
Mapbox or Open-Meteo.

## 3. Frontend on Vercel

1. Go to **vercel.com/new** and **Import** the same repository.
2. **Project Name:** `saferp`. **Root Directory:** `frontend`. **Framework Preset:** Vite (detected;
   `frontend/vercel.json` pins it too).
3. **Environment Variables**: add `VITE_API_BASE_URL` = `https://saferp-api.onrender.com`. Use your
   Render URL, with no trailing slash and no `/api`.
4. Click **Deploy**, then copy the production URL, e.g. `https://saferp.vercel.app`.

`VITE_…` variables are baked in at build time. If you change `VITE_API_BASE_URL` later, redeploy
the frontend (**Deployments → ⋯ → Redeploy**).

## 4. Connect frontend and backend

1. In Render, open **saferp-api → Environment**.
2. Set `CORS_ALLOWED_ORIGINS` to the Vercel URL from step 3, e.g. `https://saferp.vercel.app`, with
   no trailing slash. To list several origins, separate them with commas, e.g. if you also add a
   custom domain.
3. Optional, to let Vercel preview deployments call the API: add
   `CORS_ALLOWED_ORIGIN_REGEXES` = `^https://saferp-[a-z0-9-]+\.vercel\.app$`.
4. **Save Changes**. Render redeploys automatically.
5. Open the Vercel site and plan a trip, e.g. Dallas → Houston. If routes, the heatmap and the
   slider all work, the two are connected.

## 5. Checklist

- [ ] `https://<render-url>/api/health` shows `mapboxConfigured: true`.
- [ ] The cron-job.org history shows 200s every 10 minutes, and/or the GitHub Action is green.
- [ ] Vercel has `VITE_API_BASE_URL` = the Render URL, and has been redeployed since it was set.
- [ ] Render has `CORS_ALLOWED_ORIGINS` = the Vercel URL.
- [ ] Planning a trip on the Vercel site works, with no CORS errors in the browser console.

## Optional: Redis

Without Redis, the backend caches weather, routes and place searches in memory. That works well on
Render because it runs as one long-lived process, but the cache is lost on every restart or deploy.
To keep the cache across restarts:

1. Create a free Redis database at **upstash.com** (or Render → New + → Key Value).
2. Copy its connection URL (`rediss://…`) into the Render variable `REDIS_URL` and save.

---

## Environment variable reference

Backend (all optional except the first two in production):

| Variable | Default | Notes |
| --- | --- | --- |
| `MAPBOX_ACCESS_TOKEN` | — | Required. Server-side only. |
| `DJANGO_SECRET_KEY` | dev value | Required in production. |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1,.vercel.app` | Render's own hostname (`RENDER_EXTERNAL_HOSTNAME`) is added automatically. |
| `DJANGO_DEBUG` | `false` | |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | |
| `CORS_ALLOWED_ORIGIN_REGEXES` | — | |
| `REDIS_URL` / `KV_URL` | — | `redis://` or `rediss://` |
| `WIND_METRIC` | `gust` | `gust` or `sustained` |
| `TRUCK_SPEED_FACTOR` | `1.0` | |
| `FORECAST_HORIZON_HOURS` | `168` | |
| `MAX_WEATHER_POINTS` | `500` | |
| `HEATMAP_MAX_POINTS` | `400` | |
| `GEOCODE_COUNTRY` | `us` | Default only; the app sends the country picked in the form. |
| `THROTTLE_PLAN` / `THROTTLE_HEATMAP` / `THROTTLE_GEOCODE` | `12/min` / `12/min` / `120/min` | |
| `NUM_PROXIES` | `1` | Proxy hops in front of Django, used for per-IP throttling. |
| `LOG_LEVEL` | `INFO` | |

Frontend: `VITE_API_BASE_URL`.

Frontend: `VITE_API_BASE_URL`.

## Troubleshooting

- **The first request after a while takes ~1 minute.** The service was asleep. Check that the
  cron-job.org job is enabled and returns 200 every 10 minutes. Render may also restart free
  services occasionally, so expect a rare slow first request.
- **The browser console shows CORS errors.** `CORS_ALLOWED_ORIGINS` on Render must exactly match
  the frontend origin (scheme + host, no trailing slash). Save it; Render redeploys.
- **The site calls `localhost` or the wrong API.** `VITE_API_BASE_URL` was missing when Vercel
  built the site. Set it, then redeploy the frontend.
- **`/api/health` shows `"mapboxConfigured": false`.** `MAPBOX_ACCESS_TOKEN` is missing in Render →
  Environment, or isn't a Mapbox token. It must start with `pk.` or `sk.`.
- **"Mapbox Geocoding is unavailable right now: the Mapbox access token was rejected".** Mapbox
  refused the token stored on Render (HTTP 401): it was mistyped, is incomplete, or was deleted in
  your Mapbox account. In Render → saferp-api → **Environment**, edit `MAPBOX_ACCESS_TOKEN`, paste
  the exact `pk.…` value that works locally (from `backend/.env`, the part after `=`), and save.
  Render redeploys; then try `https://<render-url>/api/geocode?q=dallas`.

  To see what the server actually loaded, open `https://<render-url>/api/health?check=mapbox`
  (rate-limited). It shows `tokenLength`, `rawLength` (before stripping spaces and quotes), a
  12-character `fingerprint`, and Mapbox's verdict (`mapboxCode`: `TokenValid`, `TokenInvalid`,
  ...). The token itself is never shown. Compare the fingerprint with your local one:
  `cd backend && uv run python manage.py shell -c "from core.services.geocoding import token_diagnostics as t; print(t(True))"`.
- **Every search or plan takes 15+ seconds on Render.** Add `HTTP_FORCE_IPV4` = `true` in Render →
  Environment. It's in `render.yaml`, but a service created by hand needs it added manually.
- **400 "Bad Request" from the API on a custom domain.** Add that domain to
  `DJANGO_ALLOWED_HOSTS`. Render's own `*.onrender.com` hostname is allowed automatically.
- **Plans are slower than locally.** The free instance has a small CPU share, so a long trip's
  first plan can take 10–20 s. Repeat plans come from the cache and are fast.
- **A 502 says "Open-Meteo … rate limit".** The free weather API allows 600 location-weighted
  calls per minute. Wait a minute, or add Redis so repeat plans hit the cache.

---

## Alternative: backend on Vercel too

The backend also runs as a Vercel Python function (`backend/vercel.json`). Vercel functions don't
sleep the way a free Render service does; cold starts take a few seconds instead of a minute. If
you use this option, skip steps 1–2 above, use the Vercel backend URL as `VITE_API_BASE_URL`, and
set `CORS_ALLOWED_ORIGINS` on the Vercel backend project.

### Backend on Vercel

1. Open **vercel.com/new**, then **Import** next to this repository.
2. **Project Name:** `saferp-api` (any name works; it becomes `saferp-api.vercel.app`).
3. **Root Directory:** click **Edit**, choose `backend`, then **Continue**.
4. **Framework Preset:** Vercel should detect **Django** from `manage.py`. If it shows "Other",
   leave it; the Python runtime still detects `manage.py`.
5. Leave **Build and Output Settings** at their defaults (no build command needed).
6. Expand **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `MAPBOX_ACCESS_TOKEN` | your Mapbox token |
   | `DJANGO_SECRET_KEY` | a long random string, e.g. output of `python -c "import secrets;print(secrets.token_urlsafe(50))"` |
   | `DJANGO_ALLOWED_HOSTS` | `.vercel.app` (add your custom domain if you use one) |
   | `CORS_ALLOWED_ORIGINS` | the frontend URL from step 2, e.g. `https://saferp.vercel.app` (fill in after step 2 if you don't know it yet) |
   | `CORS_ALLOWED_ORIGIN_REGEXES` | optional, for preview builds: `^https://saferp-[a-z0-9-]+\.vercel\.app$` |

7. Click **Deploy**. When it finishes, open `https://<your-api>.vercel.app/api/health`. You should
   see `{"status":"ok","mapboxConfigured":true,...}`.

#### Add Redis (recommended)

1. In the backend project, go to **Storage → Create Database** (or **Marketplace → Upstash →
   Redis**).
2. Pick **Upstash for Redis**, the free plan and a region close to the function region (default
   `iad1`, US East), then **Create**.
3. **Connect** it to the `saferp-api` project for all environments. Depending on the
   integration version, this injects `REDIS_URL` or `KV_URL` (plus REST variables SafeRP doesn't
   use). SafeRP reads either. Check **Settings → Environment Variables**: if neither is present,
   copy the `rediss://…` connection string from the Upstash console into a new `REDIS_URL`
   variable.
4. **Deployments → ⋯ → Redeploy** so the new variables take effect.

Without Redis the API still works; each function instance just keeps its own short-lived memory
cache.

---

## Other hosts

The backend is a plain WSGI app (`saferp.wsgi:application`) with no database, so any Python host
works. Use the build and start commands from `render.yaml` and the same environment variables.
