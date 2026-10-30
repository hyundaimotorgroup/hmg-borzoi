# Docker Compose Deployment

Deploy hmg-borzoi on a single host using Docker Compose. This approach is suited for small teams and straightforward setups.

For Kubernetes deployment, see [deployment-kubernetes.md](deployment-kubernetes.md).

## Prerequisites

- Docker 24+
- Docker Compose v2
- A built app image (or access to a container registry)

## Deployment Flow

```
Build images → Prepare env vars → Run DB migration → Start app
```

---

## 1. Build Images

The committed `deploy/docker/Dockerfile` uses the public npm registry by default and builds both the application and migration images. Configure an external image registry in your CI or before pushing images; do not add private registry URLs or credentials to the Dockerfile.

### Build

```bash
# App image
docker build --target runner -f deploy/docker/Dockerfile -t borzoi:latest .

# Migration image
docker build --target migration -f deploy/docker/Dockerfile -t borzoi-job:latest .
```

To tag and push the same images to your registry, use the optional build script:

```bash
cp deploy/scripts/build-and-push.sh.example deploy/scripts/build-and-push.sh
# Set REGISTRY_URL, REGISTRY_PROJECT, and IMAGE_NAME in build-and-push.sh, then run:
./deploy/scripts/build-and-push.sh latest all
```

---

## 2. Prepare Environment Variables

Create a `.env.prod` file using `.env.local.example` as a reference:

```bash
cp .env.local.example .env.prod
```

Required values in `.env.prod`:

```env
# PostgreSQL
POSTGRES_PASSWORD=your-strong-password
DATABASE_URL=postgresql://borzoi_user:your-strong-password@postgres:5432/borzoi

# Encryption key (generate with: openssl rand -hex 32)
ENCRYPTION_KEY=your-32-byte-hex-key

# Alert scheduler token (generate with: openssl rand -hex 32)
# Images to use
APP_IMAGE=borzoi:latest
JOB_IMAGE=borzoi-job:latest
```

Generate secrets:

```bash
openssl rand -hex 32
```

---

## 3. Deploy

```bash
docker compose -f deploy/docker/docker-compose.prod.yml --env-file .env.prod up -d
```

The `migrate` service runs Prisma migrations before the `app` service starts.

Check deployment status:

```bash
docker compose -f deploy/docker/docker-compose.prod.yml ps
docker compose -f deploy/docker/docker-compose.prod.yml logs app
```

---

## 4. Create the First User

Run this inside the app container after migrations complete:

```bash
docker compose -f deploy/docker/docker-compose.prod.yml exec app \
  node scripts/create-app-user.js \
  --email you@example.com \
  --name "Admin" \
  --password "change-me" \
  --role admin
```

Available roles: `admin` / `developer` / `viewer`

---

## Updating

```bash
# Build new images
docker build --target runner -t borzoi:latest .
docker build --target migration -t borzoi-job:latest .

# Redeploy
docker compose -f deploy/docker/docker-compose.prod.yml --env-file .env.prod up -d
```

---

## Useful Commands

```bash
# View logs
docker compose -f deploy/docker/docker-compose.prod.yml logs -f app
docker compose -f deploy/docker/docker-compose.prod.yml logs migrate

# Restart the app
docker compose -f deploy/docker/docker-compose.prod.yml restart app

# Stop
docker compose -f deploy/docker/docker-compose.prod.yml down

# Stop and remove all data
docker compose -f deploy/docker/docker-compose.prod.yml down -v
```

---

## Troubleshooting

**Migration fails**

```bash
docker compose -f deploy/docker/docker-compose.prod.yml logs migrate
```

Common causes: typo in `DATABASE_URL`, `POSTGRES_PASSWORD` mismatch.

**App cannot connect to PostgreSQL**

Verify the host in `DATABASE_URL` is `postgres` (the Docker Compose service name), not `localhost`.

**Change the port**

Add `PORT=8080` (or any port) to `.env.prod`.

---

## Related

- [getting-started.md](getting-started.md) — Local development
- [deployment-kubernetes.md](deployment-kubernetes.md) — Kubernetes deployment
