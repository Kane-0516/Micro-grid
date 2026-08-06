# MicroGird

Off-grid **Microgrid Configuration System** for pre-sales sizing and economic analysis.

Given site, load, PV, storage, diesel, and inverter inputs, the tool quickly produces a microgrid proposal with system sizing, topology, cost/ROI metrics, and exportable reports.

## Stack

| Part | Path | Tech |
|------|------|------|
| Customer UI | `frontend/` | React + Vite + TypeScript |
| Product Admin UI | `frontend/product-config.html` | Same frontend app, separate entry |
| API | `backend/` | FastAPI (catalog, sizing, optimize, reports, geocoding) |

## Prerequisites

Recommended on Windows (startup scripts are Windows-oriented):

1. **Python 3.11+** (tested with 3.13)
2. **Node.js 20+**
3. **Docker Desktop** (optional, for local Pelias geocoding)
4. **Git**

Pelias is optional if you only need the main sizing flow. Enable it when you need map search, address lookup, or reverse geocoding.

## Quick start

From the repo root:

```bat
start-all.bat
```

This script:

1. Writes frontend geocoder proxy settings
2. Checks whether Pelias is available
3. Starts Pelias via Docker Compose if needed
4. Starts the FastAPI backend on port `6001`
5. Serves the built frontend from the backend when `frontend/dist/` exists

Then open:

| URL | Purpose |
|-----|---------|
| http://localhost:6001/ | Customer configuration tool |
| http://localhost:6001/product-config | Product configuration console (admin) |
| http://localhost:6001/docs | OpenAPI / Swagger |
| http://localhost:6001/api/health | Health check |

> Prefer `start-all.bat`. Some standalone `start-backend*.cmd` / `start-frontend*.cmd` scripts may still contain machine-specific paths.

## Product Configuration Console

Engineer-facing admin UI for maintaining the product catalog (not shown to end customers).

### What it does

- Create / edit / delete product records (panels, inverters, batteries, diesel, brackets, EMS, etc.)
- Maintain bilingual display names and pricing fields
- Edit shared catalog settings (voltage default map, package rules, and related globals)
- Import / export the product catalog as JSON

### How to open

**Option A — with backend-hosted build** (after `npm run build` + backend on `6001`):

```text
http://localhost:6001/product-config
```

**Option B — Vite dev mode** (backend must also be running on `6001` for API calls):

```bat
cd frontend
npm install
npm run dev
```

Then open:

```text
http://localhost:5173/product-config
```

Or use the helper script (opens the product-config entry):

```bat
start-product-config.cmd
```

> Note: update the path inside `start-product-config.cmd` if your checkout location differs from the path hardcoded in that file.

### Related files

```text
frontend/product-config.html
frontend/src/product-config-main.tsx
frontend/src/features/product-config/
backend/app/routers/product_admin.py
backend/app/routers/product_admin_runtime.py
backend/products.yaml
```

## Manual setup

### 1. Backend dependencies

```bat
cd backend
python -m pip install -r requirements.txt
```

### 2. Build frontend

```bat
cd frontend
npm install
npm run build
```

Output:

```text
frontend/dist/
```

The backend serves this directory at `http://localhost:6001/`.

### 3. Start backend

```bat
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 6001 --app-dir .
```

### 4. Frontend / backend split (development)

```bat
cd frontend
npm install
npm run dev
```

- Frontend: `http://localhost:5173/`
- Product admin: `http://localhost:5173/product-config`
- Backend: `http://localhost:6001/`

Vite proxies `/api` to the backend during development.

## Docker

Root `docker-compose.yml` includes:

- `postgres` — product catalog database
- `backend` — FastAPI
- `frontend` — Nginx static hosting

```bat
docker compose up -d --build
```

- Frontend: `http://localhost:8081/`
- Product admin: `http://localhost:8081/product-config`
- Backend docs: `http://localhost:6001/docs`

```bat
docker compose down
```

For Pelias, see:

- `pelias/README.md`
- `docs/GEOCODER_PROXY.md`
- `docs/PELIAS_DOCKER_EXPLAINED.md`
- `deploy/README.md`

## Repository layout

```text
MicroGird/
├─ frontend/                 # Customer UI + product-config entry
│  ├─ product-config.html    # Product Configuration Console entry
│  └─ src/features/
│     ├─ welcome/            # Landing page
│     ├─ wizard/             # Known-load & DIY flows
│     ├─ result/             # Results / ROI / report download
│     ├─ topology/           # System topology views
│     └─ product-config/     # Admin catalog UI
├─ backend/                  # FastAPI API
│  ├─ app/routers/           # calculate, optimize, report, product admin, geocode
│  ├─ app/services/          # sizing, simulation, economics, Excel export
│  └─ products.yaml          # Catalog fallback data
├─ docs/                     # Design notes and runbooks
├─ pelias/                   # Geocoder configs
├─ deploy/                   # Deploy / compose helpers
└─ start-all.bat             # Recommended one-click start
```

## Main features

1. **Known-load sizing** — site, load, storage, diesel constraints → recommended configuration
2. **DIY flow** — step-by-step PV / inverter / battery / diesel selection
3. **Results page** — capacities, cost estimate, ROI charts, contact summary
4. **Topology views** — microgrid structure and standard-product wiring
5. **Report export** — downloadable solution workbook
6. **Product Configuration Console** — catalog, prices, and shared settings for engineers

## Troubleshooting

### Page will not open

Check that the backend is up:

```text
http://localhost:6001/docs
```

If Swagger does not load, inspect backend logs / the terminal that started uvicorn.

### Map search / address lookup fails

Geocoding depends on Pelias (default local search URL):

```text
http://localhost:4000/v1/search
```

Main sizing usually still works without Pelias.

### UI changes do not appear

If the backend is serving `frontend/dist/`, rebuild:

```bat
cd frontend
npm run build
```

For live reload during development, use `npm run dev`.

### Product admin API errors

Confirm:

1. Backend is running on `6001`
2. You opened `/product-config` (not only the customer home page)
3. In Vite mode, `/api` proxy reaches the backend

### Python dependency install fails

```bat
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
```

Heavy packages (`pandas`, solvers, etc.) may take a while.

## Smoke checklist

1. `http://localhost:6001/docs` — API docs load
2. `http://localhost:6001/api/health` — health OK
3. `http://localhost:6001/` — customer tool loads
4. `http://localhost:6001/product-config` — product admin loads and can list catalog items
5. Walk one known-load or DIY flow through to a result page

## Notes

This repo is a pre-sales demo / proposal tool, not a production O&M platform. Before a demo or handoff:

- Rebuild the frontend
- Verify backend health
- Verify Pelias if map search is required
- Review product prices and equipment parameters in the Product Configuration Console
- Test report export once
