# SafeRP

Weather-aware truck route planner. A Django REST API generates three route options,
places checkpoints along each, forecasts the weather at each checkpoint's ETA, scores
risk, and recommends a route. A React + MapLibre frontend shows routes, risk and a
0–48 h weather heatmap.

> Work in progress. Full docs land in the final phase.

## Quick start

```bash
# backend
cd backend && cp .env.example .env   # add MAPBOX_ACCESS_TOKEN
uv sync && uv run python manage.py runserver 8000

# frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```
