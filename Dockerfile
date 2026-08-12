# Multi-stage Dockerfile for Net Worth Tracker
# Builds both frontend and backend, serves backend with frontend static files

# Stage 1: Build Frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend with Python
FROM python:3.12-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/frontend/dist ./backend/static

# Expose port
EXPOSE 5001

# Set environment variables
ENV FLASK_APP=backend.app
ENV PYTHONPATH=/app

# Create data directory for SQLite
RUN mkdir -p /app/backend/data

# Run Flask app (serves both API and static files)
CMD ["python", "-m", "flask", "run", "--host=0.0.0.0", "--port=5001"]
