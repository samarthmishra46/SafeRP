# Deploying SafeRP

Both halves deploy to **Vercel** as two projects from the same Git repository. The backend is
stateless and configured entirely through environment variables. Redis is optional but
recommended (Upstash, free tier).

You need a GitHub (or GitLab/Bitbucket) account with this repo pushed, a Vercel account, and a
Mapbox access token (account.mapbox.com → Tokens; the default public token works).

---

## 1. Backend (Django API)

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

### Add Redis (recommended)

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

## 2. Frontend (React app)

1. **vercel.com/new**, then **Import** the same repository again.
2. **Project Name:** `saferp`.
3. **Root Directory:** `frontend`. **Framework Preset:** **Vite** (auto-detected; `vercel.json`
   pins it too).
4. **Environment Variables:**

   | Name | Value |
   | --- | --- |
   | `VITE_API_BASE_URL` | the backend URL from step 1, e.g. `https://saferp-api.vercel.app` (no trailing slash) |

5. **Deploy**, then open the URL.

### Connect the two

1. Copy the frontend's production URL (e.g. `https://saferp.vercel.app`).
2. In the **backend** project: **Settings → Environment Variables**. Set `CORS_ALLOWED_ORIGINS` to
   that URL; several origins can be comma-separated.
3. **Deployments → ⋯ → Redeploy** the backend.
4. Reload the frontend, plan a trip (e.g. Dallas → Houston), and check that routes appear and the
   heatmap loads.

---

## Environment variable reference

Backend (all optional except the first two in production):

| Variable | Default | Notes |
| --- | --- | --- |
| `MAPBOX_ACCESS_TOKEN` | — | Required. Server-side only. |
| `DJANGO_SECRET_KEY` | dev value | Required in production. |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1,.vercel.app` | |
| `DJANGO_DEBUG` | `false` | |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | |
| `CORS_ALLOWED_ORIGIN_REGEXES` | — | |
| `REDIS_URL` / `KV_URL` | — | `redis://` or `rediss://` |
| `WIND_METRIC` | `gust` | `gust` or `sustained` |
| `TRUCK_SPEED_FACTOR` | `1.0` | |
| `FORECAST_HORIZON_HOURS` | `168` | |
| `MAX_WEATHER_POINTS` | `500` | |
| `HEATMAP_MAX_POINTS` | `400` | |
| `GEOCODE_COUNTRY` | `us` | |
| `THROTTLE_PLAN` / `THROTTLE_HEATMAP` / `THROTTLE_GEOCODE` | `12/min` / `12/min` / `120/min` | |
| `NUM_PROXIES` | `1` | Proxy hops in front of Django, used for per-IP throttling. |
| `LOG_LEVEL` | `INFO` | |

Frontend: `VITE_API_BASE_URL`.

## Troubleshooting

- **The browser console shows CORS errors.** `CORS_ALLOWED_ORIGINS` on the backend must exactly
  match the frontend origin (scheme + host, no trailing slash). Redeploy after changing it.
- **`/api/health` shows `"mapboxConfigured": false`.** The token variable is missing from that
  environment (Production vs Preview).
- **A 502 says "Open-Meteo … rate limit".** The free tier allows 600 location-weighted calls per
  minute. Add Redis so repeat plans hit the cache, or wait a minute.
- **400 "Invalid HTTP_HOST header".** Add the domain to `DJANGO_ALLOWED_HOSTS`.

## Alternative hosts

The backend is a plain WSGI app (`saferp.wsgi:application`) with no database, so any Python host
works. For example, on Render: a web service with root `backend`, build command `pip install uv &&
uv sync --no-dev`, start command `uv run gunicorn saferp.wsgi` (add `gunicorn` to the dependencies),
and the same environment variables.
