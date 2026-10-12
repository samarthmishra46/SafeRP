Instructions I give in conversation always override anything in this file. If they conflict, follow the conversation and update this file to match.

# SafeRP

Weather-aware truck route planner: Django REST API (`backend/`) + React/Vite/MUI/MapLibre app (`frontend/`).

## Layout
- `backend/saferp/` — settings (all config from env vars), urls, wsgi
- `backend/core/domain/` — pure logic, no I/O or Django imports:
  `risk.py` (risk thresholds and load rules), `weather.py` (hour-bucket sampling),
  `checkpoints.py`, `geo.py`, `ranking.py`, `evaluate.py`, `routes.py`, `grid.py`,
  `hazards.py` (hourly hazard levels for the slider animations; never used for risk),
  `rest.py` (optional driver-chosen rest stops that shift ETAs)
- `backend/core/services/` — Mapbox/Open-Meteo clients, cache, planner and heatmap orchestration
- `backend/core/api/` — serializers, presenters (camelCase JSON), views, error handler
- `backend/tests/` — pytest; `fixtures/` holds recorded upstream responses (`scripts/record_fixtures.py`)
- `frontend/src/` — `api/` client + hooks, `components/`, `map/` (lazy MapView, layers, `HourLayers.tsx` slider-driven layers, `weatherAnimation.ts` animated icons), `lib/` (`timeline.ts`, `hazards.ts`, `units.ts` display units per country), `state/` (zustand), `theme/`
- Deploy: `render.yaml` (backend on Render), `.github/workflows/keep-backend-awake.yml` (keep-alive ping), `frontend/vercel.json`
- Docs: `README.md`, `DECISIONS.md`, `DEPLOY.md`, `LOOM_SCRIPT.md`

## Commands
- Backend run: `cd backend && uv sync && uv run python manage.py runserver 8000`
- Backend test/lint: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`
- Frontend run: `cd frontend && npm install && npm run dev` (proxies `/api` to `API_PROXY_TARGET`, default :8000)
- Frontend test/lint: `npm test`, `npm run lint`, `npm run typecheck`, `npm run format:check`
- Build: `npm run build`

## Environment
- Backend reads `backend/.env` then the repo-root `.env`; see `backend/.env.example`.
- Frontend: `VITE_API_BASE_URL` (empty in local dev).
