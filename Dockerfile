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
# --timeout 90: gunicorn's 30s default kills the worker mid-request on the
# AI endpoints (allocation advisor, budget insights, tag suggestions,
# search), which routinely take 20-40s on Gemini's free tier even when
# nothing is wrong — that read as random "lag"/failures without this.
CMD flask db upgrade && gunicorn --bind 0.0.0.0:${PORT:-5001} --workers 2 --timeout 90 "backend.app:create_app()"
