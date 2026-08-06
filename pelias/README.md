# Pelias local deployment for MicroGrid

This directory contains a practical Windows setup for running Pelias locally with Docker Desktop.

Important:

- The official `pelias/docker` project documents Linux and macOS as supported platforms. In practice, the workable Windows path is Docker Desktop with the WSL2 backend.
- This repo already points the backend and frontend at `http://localhost:4000` through [`start-all.bat`](/C:/Panskai-work/PyPSA/MicroGrid/start-all.bat).

## What is included

- `setup-windows.ps1`: bootstraps a local Pelias project under `.tools/pelias-docker/projects/`
- `pelias.us.json`: US-focused config using Who's on First, OSM, and OpenAddresses
- `pelias.cn.json`: China-focused config using Who's on First and OSM
- `run-import-us.sh`: WSL shell script to build and start the US Pelias instance at street-level scale
- `run-import-us-addresses.sh`: optional WSL shell script to add address-point data after the street-level index is working
- `run-import-cn.sh`: WSL shell script to build and start the China Pelias instance

## Prerequisites

Install these first:

- Docker Desktop with WSL2 backend enabled
- A working WSL distribution, for example Ubuntu
- Git

Recommended Docker Desktop resources:

- RAM: 12 GB minimum, 16 GB preferred
- Disk: 80 GB free for a US build, more if you keep raw downloads
- CPU: 4 cores minimum

## 1. Initialize a Pelias project

For the US build:

```powershell
powershell -ExecutionPolicy Bypass -File .\pelias\setup-windows.ps1 -Region us
```

For the China build:

```powershell
powershell -ExecutionPolicy Bypass -File .\pelias\setup-windows.ps1 -Region cn
```

This script will:

- clone `https://github.com/pelias/docker.git` into `.tools/pelias-docker` if missing
- create `.tools/pelias-docker/projects/microgrid-us` or `microgrid-cn`
- write the project `.env` with a WSL-safe `DATA_DIR`
- copy this repo's `pelias.json` template into the Pelias project

## 2. Run the data import from WSL

US import:

```bash
bash /mnt/c/Panskai-work/PyPSA/MicroGrid/pelias/run-import-us.sh
```

Optional US address-point import after the above succeeds:

```bash
bash /mnt/c/Panskai-work/PyPSA/MicroGrid/pelias/run-import-us-addresses.sh
```

China import:

```bash
bash /mnt/c/Panskai-work/PyPSA/MicroGrid/pelias/run-import-cn.sh
```

The default US script downloads:

- Who's on First admin data
- US OpenStreetMap extract

That is the recommended path if your goal is city, street, and POI lookup across the US without the overhead of global address imports.

The optional US address-point script downloads:

- OpenAddresses data

The China script downloads:

- Who's on First admin data
- China OpenStreetMap extract

Notes:

- `run-import-us.sh` now skips `openaddresses` on purpose, because street-level US search does not require a global address import.
- `run-import-us-addresses.sh` is optional and should only be run if you need address-point or house-number level recall beyond what OSM already provides.
- The US profile still leaves `imports.openaddresses.files` unset, which means an address-point import will download the full OpenAddresses bundle by default. That is much heavier on bandwidth and disk than the street-level workflow.
- If you later want a smaller address import, edit `imports.openaddresses.files` in `.tools/pelias-docker/projects/microgrid-us/pelias.json` and replace it with a narrower list such as `["us/ny/city_of_new_york.csv"]` before running `run-import-us-addresses.sh`.
- China address-level quality will usually still be weaker than a dedicated Chinese geocoder, even after Pelias is working.

## 3. Verify Pelias

Forward geocoding:

```bash
curl "http://localhost:4000/v1/search?text=1600+Pennsylvania+Ave+NW&size=1"
```

Reverse geocoding:

```bash
curl "http://localhost:4000/v1/reverse?point.lat=39.8977&point.lon=-77.0365&size=1"
```

If those return a Pelias `FeatureCollection`, the backend proxy is ready to use.

## 4. Start the MicroGrid app against Pelias

Run:

```powershell
.\start-all.bat
```

That script expects Pelias to already be serving:

- `http://localhost:4000/v1/search`
- `http://localhost:4000/v1/reverse`

## Cleanup and reruns

Useful commands inside the Pelias project directory:

```bash
../../pelias compose down
../../pelias compose logs
../../pelias elastic drop
```

Use `elastic drop` only if you want to rebuild the index from scratch.

