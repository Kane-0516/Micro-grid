# MicroGrid Deployment

This deployment bundle is split into three parts:

- frontend image: Nginx static site
- backend image: FastAPI + PyPSA
- Pelias stack: separate geocoder services and data

Recommended EC2 host directories:

- app root: /opt/docker/pre-sale
- report templates: /opt/docker/pre-sale/report_templates
- Pelias data: /opt/docker/pre-sale/pelias-data/us

## Files

- docker-compose.app.yml: frontend + backend stack
- .env.example: app environment template
- docker-compose.pelias.yml: Pelias stack
- .env.pelias.example: Pelias environment template
- pelias/pelias.json: Pelias config used by the stack
- pelias/blacklist/osm.txt: Pelias blacklist placeholder

## Exported image archives

- artifacts/microgrid-backend_20260403.tar
- artifacts/microgrid-frontend_20260403.tar
- artifacts/pelias-microgrid-us_images_20260407.tar

Important: the Pelias image archive does not contain the Pelias dataset. You must copy or restore the data directory separately.

## Load images on EC2

```bash
docker load -i microgrid-backend_20260403.tar
docker load -i microgrid-frontend_20260403.tar
docker load -i pelias-microgrid-us_images_20260407.tar
```

## Prepare host directories

```bash
sudo mkdir -p /opt/docker/pre-sale/report_templates
sudo mkdir -p /opt/docker/pre-sale/pelias-data/us
```

Copy the two private Excel template files into:

```text
/opt/docker/pre-sale/report_templates
```

Copy the Pelias US dataset into:

```text
/opt/docker/pre-sale/pelias-data/us
```

## Start frontend + backend

```bash
cd /opt/docker/pre-sale/deploy
cp .env.example .env
docker compose --env-file .env -f docker-compose.app.yml up -d
```

If Pelias runs on the same EC2 host, change the geocoder URLs in `.env` from `host.docker.internal` to the reachable Pelias address, for example `http://<ec2-private-ip>:4000/v1/search` and `http://<ec2-private-ip>:4000/v1/reverse`.

## Start Pelias

```bash
cd /opt/docker/pre-sale/deploy
cp .env.pelias.example .env.pelias
docker compose --env-file .env.pelias -f docker-compose.pelias.yml up -d
```

## Stop stacks

```bash
docker compose --env-file .env -f docker-compose.app.yml down
docker compose --env-file .env.pelias -f docker-compose.pelias.yml down
```

## Default ports

- frontend: 8081
- backend: 6001
- Pelias API: 4000

## Notes

- Frontend and backend can be deployed without Pelias if geocoding is not required.
- Pelias needs enough disk for the full data directory. The current US dataset is much larger than 20 GB.
- Backend report export depends on the private Excel templates being mounted into `/backend/.private/report_templates`.
