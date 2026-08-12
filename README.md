# Net Worth Tracker

A comprehensive full-stack application for tracking personal net worth, assets, and investments with analytics and insights.

## Features

### ✅ Core Features Implemented

1. **Centralized API Layer**
   - Unified API client with error handling, timeout, and base URL configuration
   - Data mapping layer to normalize backend responses
   - Consistent field names across frontend

2. **React Query Integration**
   - Automatic caching and refetching
   - Optimistic UI updates
   - Query invalidation on mutations

3. **Comprehensive Loading & Error States**
   - Reusable LoadingState component
   - Reusable ErrorState component with retry
   - EmptyState component for better UX
   - Consistent error handling across all pages

4. **Asset Management**
   - Add assets with validation (stocks, mutual funds, real estate, metals, cash, deposits, loans)
   - Edit assets functionality
   - Delete assets with confirmation modal
   - Form validation and success toasts

5. **Stocks Page**
   - Dedicated `/stocks` endpoint
   - Edit and delete with confirmation
   - Real-time price updates (when API key configured)

6. **Analytics Dashboard**
   - Net worth over time with time range selector
   - Portfolio allocation pie chart with legends and tooltips
   - CAGR histogram by asset
   - CAGR explanations and tooltips

7. **Financial Correctness**
   - Division by zero protection
   - Negative value handling (loans)
   - Zero buy value handling
   - Consistent rounding at display layer only

8. **Service Layer Architecture**
   - Separated calculation logic from Flask routes
   - Testable business logic
   - Reusable metric calculations

9. **Domain Enums**
   - Asset type validation
   - Country constants
   - Type-safe constants on frontend and backend

10. **Filters & Search**
    - Filter by asset type, country, account
    - Tag-based search with autocomplete
    - Clear filters functionality
    - Applied across Dashboard, Assets, and Portfolio

11. **Notes & Tags**
    - Add personal notes to any asset
    - Tag assets for organization (e.g., "retirement", "dividend", "long-term")
    - Search assets by tags
    - Tags displayed as badges on asset cards

12. **Tests (Minimal but Critical)**
    - Backend tests for financial correctness (CAGR, profit calculations)
    - Frontend tests for data mapping validation
    - Prevents regression in financial calculations

13. **Production Ready**
    - Dockerfile for containerized deployment
    - Deployment guides for Railway, Render, Fly.io
    - Environment-based configuration
    - Static file serving in production

## Project Structure

```
networth_tracker/
├── backend/
│   ├── app.py              # Flask routes (orchestration only)
│   ├── models.py           # SQLAlchemy models
│   ├── services.py         # Business logic and calculations
│   ├── finance.py          # CAGR and financial calculations
│   ├── utils.py            # Stock price fetching
│   ├── enums.py            # Domain enums
│   └── requirements.txt    # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── api/            # API client and data mapping
│   │   │   ├── client.js   # Centralized API client
│   │   │   ├── mappers.js  # Data normalization
│   │   │   └── index.js    # API functions
│   │   ├── components/     # React components
│   │   ├── constants/      # Enums and constants
│   │   ├── utils/          # Formatters and utilities
│   │   └── queryClient.js  # React Query configuration
│   └── package.json
└── README.md
```

## Setup

### Backend

1. Create virtual environment:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set environment variables:
```bash
export FINNHUB_API_KEY=your_api_key_here  # Optional, for stock price fetching
```

4. Run the backend:
```bash
python -m backend.app
# Or
flask run --port 5001
```

### Frontend

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Set environment variables (optional):
```bash
# Create .env file
VITE_API_URL=http://localhost:5001
```

3. Run the frontend:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## API Endpoints

### Assets
- `GET /assets` - Get all assets
- `GET /assets/:id` - Get single asset
- `POST /assets` - Create asset
- `PUT /assets/:id` - Update asset
- `DELETE /assets/:id` - Delete asset

### Summary
- `GET /summary` - Get dashboard summary with aggregates

### Stocks
- `GET /stocks` - Get all stocks (derived from assets)

### Analytics
- `GET /analytics` - Get analytics data (time series, allocation, CAGR)

## Environment Variables

### Backend
- `FINNHUB_API_KEY` - API key for Finnhub stock price service (optional)

### Frontend
- `VITE_API_URL` - Backend API base URL (default: http://localhost:5001)

## Improvements Made

### Critical Fixes ✅
1. ✅ Fixed broken data mapping - No more undefined/NaN values
2. ✅ Centralized API configuration - Single source of truth
3. ✅ Added loading/error states everywhere
4. ✅ Fixed Stocks page backend mismatch
5. ✅ Improved Add Asset UX with validation
6. ✅ Added delete/update flows with confirmation
7. ✅ Integrated React Query for caching
8. ✅ Enhanced Analytics with tooltips, legends, time range
9. ✅ Financial correctness safeguards
10. ✅ Separated calculation logic from routes
11. ✅ Domain enums for type safety

### Remaining Enhancements (Future Work)
- [ ] Authentication and user separation
- [ ] Production deployment setup (Docker, etc.)
- [ ] Time series accuracy with historical snapshots
- [ ] UX hierarchy improvements
- [ ] Filters and drilldowns
- [ ] User notes and tags
- [ ] Unit and integration tests
- [ ] Comprehensive documentation

## Technologies Used

### Backend
- Flask
- SQLAlchemy
- Python 3.12+

### Frontend
- React 18
- React Router
- TanStack Query (React Query)
- Recharts
- Vite

## License

MIT
