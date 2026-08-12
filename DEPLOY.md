# Deployment Guide

## Quick Deploy Options

### Option 1: Railway (Recommended - Easiest)

1. **Sign up at [Railway](https://railway.app)**

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo" (or use Railway CLI)

3. **Configure Environment Variables**
   ```
   FLASK_APP=backend.app
   PYTHONPATH=/app
   FINNHUB_API_KEY=your_api_key_here (optional)
   PORT=5001
   ```

4. **Railway Auto-Detection**
   - Railway will detect the Dockerfile
   - Or set build command: `docker build -t networth-tracker .`
   - Set start command: `python -m flask run --host=0.0.0.0 --port=$PORT`

5. **Deploy**
   - Railway will build and deploy automatically
   - Get your app URL from Railway dashboard

**Note:** For frontend-only deployment, you can also deploy just the frontend to Vercel/Netlify and point it to a separate backend URL.

---

### Option 2: Render

1. **Sign up at [Render](https://render.com)**

2. **Create New Web Service**
   - Connect your GitHub repository
   - Select "Docker" as the environment

3. **Configure Build Settings**
   ```
   Build Command: docker build -t networth-tracker .
   Start Command: python -m flask run --host=0.0.0.0 --port=$PORT
   ```

4. **Environment Variables**
   ```
   FLASK_APP=backend.app
   PYTHONPATH=/app
   FINNHUB_API_KEY=your_api_key (optional)
   ```

5. **Deploy**
   - Render will build from Dockerfile
   - Auto-deploys on git push

---

### Option 3: Fly.io

1. **Install Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login and Create App**
   ```bash
   fly auth login
   fly launch
   ```

3. **Create `fly.toml`** (see below)

4. **Deploy**
   ```bash
   fly deploy
   ```

---

## Manual Docker Deployment

### Build Image
```bash
docker build -t networth-tracker .
```

### Run Locally
```bash
docker run -p 5001:5001 \
  -e FINNHUB_API_KEY=your_key \
  networth-tracker
```

### Push to Registry
```bash
# Tag for your registry
docker tag networth-tracker your-registry/networth-tracker

# Push
docker push your-registry/networth-tracker
```

---

## Environment Variables

### Required
- `FLASK_APP=backend.app` - Flask application entry point
- `PYTHONPATH=/app` - Python path for imports

### Optional
- `FINNHUB_API_KEY` - For real-time stock prices (get free key at finnhub.io)
- `PORT` - Server port (default: 5001)
- `DATABASE_URL` - If using PostgreSQL instead of SQLite (future enhancement)

### Frontend
- `VITE_API_URL` - Backend API URL (default: http://localhost:5001)
  - For production: Set to your deployed backend URL
  - Example: `VITE_API_URL=https://your-app.railway.app`

---

## Production Considerations

### Database
- Current setup uses SQLite (file-based)
- For production, consider PostgreSQL:
  1. Use `DATABASE_URL` environment variable
  2. Update `app.py` to use PostgreSQL if `DATABASE_URL` is set
  3. Most platforms (Railway, Render) provide managed PostgreSQL

### Static Files
- Current Dockerfile serves frontend from `/backend/static`
- For better performance, consider:
  - CDN for static assets
  - Separate frontend deployment (Vercel/Netlify)

### Security
- Add CORS restrictions in production
- Use environment variables for secrets
- Consider adding authentication (future enhancement)

---

## Troubleshooting

### Port Issues
- Railway/Render use dynamic `$PORT` environment variable
- Update start command to use `--port=$PORT` instead of hardcoded 5001

### Build Failures
- Ensure all dependencies are in `requirements.txt`
- Check Node.js and Python versions match Dockerfile

### Database Issues
- Ensure data directory is writable
- For SQLite on platforms: Use volume mounts or switch to PostgreSQL

---

## Quick Deploy Checklist

- [ ] Repository pushed to GitHub
- [ ] Environment variables configured
- [ ] Dockerfile tested locally
- [ ] Backend URL configured for frontend (if separate deployment)
- [ ] Database initialized (first run)
- [ ] Domain configured (optional)
