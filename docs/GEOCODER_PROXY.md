# Deploying the Pelias geocoder proxy

This project standardizes on a local Pelias deployment for forward and reverse geocoding.

## 1. Start Pelias

Pelias should be available at:

- `http://localhost:4000/v1/search`
- `http://localhost:4000/v1/reverse`

Setup and import instructions are documented in `pelias/README.md`.

## 2. Start the app against Pelias

From the repo root, run:

```bash
start-all.bat
```

That script:

- writes `frontend/.env.local`
- verifies the Pelias API is reachable
- starts the FastAPI backend on `http://localhost:6001`
- starts the frontend dev server on `http://localhost:5173`

## 3. Test the proxy

Forward geocoding:

```bash
curl "http://localhost:6001/api/geocode?q=1600+Pennsylvania+Ave+NW&country_code=us"
```

Reverse geocoding:

```bash
curl "http://localhost:6001/api/reverse-geocode?lat=38.897473&lon=-77.036551&country_code=us"
```

If Pelias is unavailable, the backend returns a `503` with a Pelias-specific error message. For a small set of Chinese city names, the backend also retains a local fallback list so the UI can still resolve major cities when the China query is simple.