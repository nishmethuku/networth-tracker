# Backend-only Dockerfile for Render.
# The frontend is a separate Vercel deployment (frontend/) — this image only
# serves the Flask API.

FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY migrations/ ./migrations/

ENV FLASK_APP=backend.app
ENV FLASK_ENV=production
ENV PYTHONPATH=/app

EXPOSE 5001

# flask db upgrade applies any pending Alembic migrations before the app starts.
# --timeout 300: gunicorn's 30s default kills the worker mid-request on the
# AI endpoints (allocation advisor, budget insights, tag suggestions,
# search), which routinely take 20-40s on Gemini's free tier even when
# nothing is wrong. 90s covered those, but not /internal/weekly-digest,
# which loops over every recipient generating an AI narrative (up to ~70s
# each, per ai_service's own SDK timeout) and a full data backup per
# person — with more than one recipient that adds up past 90s and got the
# whole worker killed mid-run (observed directly: a real cron run died at
# ~99s). Interactive routes are unaffected by raising this: they're each
# already bounded well under 300s by their own internal timeouts (the
# frontend gives up at 60s regardless), so this only gives the background
# digest job the room it actually needs.
# --preload loads the Flask app once in the master process and forks workers
# from that state, cutting module-import time roughly in half on cold start.
# Safe here because create_app() makes no DB connections at startup — the
# SQLAlchemy pool is lazy, so no connections exist at fork time for workers
# to share (shared connections across fork are the usual preload hazard with
# SQLAlchemy; an empty pool at fork time means that hazard doesn't apply).
CMD flask db upgrade && gunicorn --bind 0.0.0.0:${PORT:-5001} --workers 2 --timeout 300 --preload "backend.app:create_app()"
