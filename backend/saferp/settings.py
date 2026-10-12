"""Django settings. Everything is configured through environment variables."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader for local development; real env vars always win."""
    if not path.is_file():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


_load_dotenv(BASE_DIR / ".env")
_load_dotenv(BASE_DIR.parent / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)
# No sessions, cookies or signed data are used; Django still requires a key.
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-insecure-key")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,.vercel.app")
# Render sets this to the service's public hostname (e.g. saferp-api.onrender.com).
if os.environ.get("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(os.environ["RENDER_EXTERNAL_HOSTNAME"])

INSTALLED_APPS = [
    "corsheaders",
    "rest_framework",
    "core",
]

MIDDLEWARE = [
    "django.middleware.gzip.GZipMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# A cookie-less JSON API behind a TLS-terminating platform (which also sends HSTS):
# CSRF middleware, SSL redirect and app-level HSTS add nothing here.
SILENCED_SYSTEM_CHECKS = ["security.W003", "security.W004", "security.W008"]

# Behind Vercel/Render proxies: trust the forwarded scheme.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

ROOT_URLCONF = "saferp.urls"
WSGI_APPLICATION = "saferp.wsgi.application"

# Stateless service: no database.
DATABASES: dict = {}

USE_TZ = True
TIME_ZONE = "UTC"
APPEND_SLASH = False

# --- CORS -------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
)
CORS_ALLOWED_ORIGIN_REGEXES = env_list("CORS_ALLOWED_ORIGIN_REGEXES")
CORS_ALLOW_METHODS = ["GET", "POST", "OPTIONS"]

# --- Cache ------------------------------------------------------------------
# Upstash via the Vercel Marketplace exposes KV_URL; any redis:// or rediss:// URL works.
REDIS_URL = (os.environ.get("REDIS_URL") or os.environ.get("KV_URL") or "").strip()
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
            "KEY_PREFIX": "saferp",
            "TIMEOUT": 1800,
            "OPTIONS": {"socket_connect_timeout": 2, "socket_timeout": 2},
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "saferp",
            "TIMEOUT": 1800,
            "OPTIONS": {"MAX_ENTRIES": 20000},
        }
    }

# --- DRF --------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "geocode": os.environ.get("THROTTLE_GEOCODE", "120/min"),
        "plan": os.environ.get("THROTTLE_PLAN", "12/min"),
        "heatmap": os.environ.get("THROTTLE_HEATMAP", "12/min"),
    },
    "EXCEPTION_HANDLER": "core.api.errors.exception_handler",
    "NUM_PROXIES": int(os.environ.get("NUM_PROXIES", "1")),
}

# --- Logging ----------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
}


# --- SafeRP domain configuration -----------------------------------------------
def clean_token(raw: str, name: str = "MAPBOX_ACCESS_TOKEN") -> str:
    """Forgive common dashboard paste mistakes: spaces, quotes, or the whole `NAME=value` line."""
    token = raw.strip().strip("\"'").strip()
    if token.startswith(f"{name}="):
        token = token[len(name) + 1 :].strip().strip("\"'").strip()
    return token


MAPBOX_ACCESS_TOKEN_RAW_LENGTH = len(os.environ.get("MAPBOX_ACCESS_TOKEN", ""))  # for diagnostics
MAPBOX_ACCESS_TOKEN = clean_token(os.environ.get("MAPBOX_ACCESS_TOKEN", ""))
OPEN_METEO_URL = os.environ.get("OPEN_METEO_URL", "https://api.open-meteo.com/v1/forecast")
# Optional paid Open-Meteo key; requests then go to the customer endpoint with their own quota.
OPEN_METEO_API_KEY = os.environ.get("OPEN_METEO_API_KEY", "").strip()
OPEN_METEO_CUSTOMER_URL = os.environ.get(
    "OPEN_METEO_CUSTOMER_URL", "https://customer-api.open-meteo.com/v1/forecast"
)
MAPBOX_API_URL = os.environ.get("MAPBOX_API_URL", "https://api.mapbox.com")

# "gust" (default) or "sustained": which wind value feeds the risk rules.
WIND_METRIC = os.environ.get("WIND_METRIC", "gust")
# Multiplies vehicle speed: 0.9 means the truck drives 10% slower than Mapbox's estimate.
TRUCK_SPEED_FACTOR = float(os.environ.get("TRUCK_SPEED_FACTOR", "1.0"))
# Hours of forecast fetched per point (Open-Meteo default is 7 days).
FORECAST_HORIZON_HOURS = int(os.environ.get("FORECAST_HORIZON_HOURS", "168"))
# Upper bound on distinct weather locations per plan request (Open-Meteo weighs per location).
# Forecast provider: "open-meteo" (default; batched, free per-IP quota) or "pirate-weather"
# (needs PIRATE_WEATHER_API_KEY; one call per location, 10,000 calls/month on the free plan).
WEATHER_PROVIDER = os.environ.get("WEATHER_PROVIDER", "open-meteo").strip().lower()
PIRATE_WEATHER_API_KEY = clean_token(
    os.environ.get("PIRATE_WEATHER_API_KEY", ""), "PIRATE_WEATHER_API_KEY"
)
PIRATE_WEATHER_URL = os.environ.get("PIRATE_WEATHER_URL", "https://api.pirateweather.net/forecast")
_PIRATE = WEATHER_PROVIDER == "pirate-weather"
# Per-plan and heatmap location budgets; smaller defaults when every location costs one call.
MAX_WEATHER_POINTS = int(os.environ.get("MAX_WEATHER_POINTS") or (150 if _PIRATE else 500))
HEATMAP_MAX_POINTS = int(os.environ.get("HEATMAP_MAX_POINTS") or (80 if _PIRATE else 400))
HTTP_TIMEOUT_SECONDS = float(os.environ.get("HTTP_TIMEOUT_SECONDS", "12"))
UPSTREAM_WORKERS = int(os.environ.get("UPSTREAM_WORKERS", "8"))
HTTP_FORCE_IPV4 = env_bool("HTTP_FORCE_IPV4", False)
# ISO country filter for place search (comma-separated, empty = worldwide).
GEOCODE_COUNTRY = os.environ.get("GEOCODE_COUNTRY", "us")
