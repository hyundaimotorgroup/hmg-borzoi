# Getting Started

This guide walks you through setting up a local development environment.

For production deployment, see [deployment-docker.md](deployment-docker.md) or [deployment-kubernetes.md](deployment-kubernetes.md).

## Prerequisites

- Node.js 20+
- npm
- Docker / Docker Compose (for local PostgreSQL)
- A running ClickHouse instance

---

## Quick Start

```bash
git clone https://github.com/hyundaimotorgroup/hmg-borzoi.git
cd hmg-borzoi
npm install
cp .env.local.example .env.local
# Set ENCRYPTION_KEY and DATABASE_URL in .env.local
docker compose -f deploy/docker/docker-compose.yml up -d
npm run db:generate
npm run db:migrate -- --name init
node scripts/create-app-user.js --email you@example.com --name "Admin" --password "change-me" --role admin
npm run dev
```

Open `http://localhost:3000` and log in with the account you created.

---

## Step by Step

### 1. Configure environment variables

```bash
cp .env.local.example .env.local
```

Set the following values in `.env.local`:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (default targets local Docker) |
| `ENCRYPTION_KEY` | Key for encrypting ClickHouse credentials stored in DB |
| `CRON_SECRET` | Token for authenticating the alert scheduler |

```bash
# Generate ENCRYPTION_KEY and CRON_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Start PostgreSQL

```bash
docker compose -f deploy/docker/docker-compose.yml up -d
```

| Setting | Default |
|---------|---------|
| host | `localhost` |
| port | `5433` |
| database | `borzoi` |
| user | `borzoi_user` |

### 3. Run database migrations

```bash
npm run db:generate
npm run db:migrate -- --name init
```

If the database already has migration history, omit `-- --name init`.

### 4. Create the first user

```bash
node scripts/create-app-user.js \
  --email you@example.com \
  --name "Admin" \
  --password "change-me" \
  --role admin
```

Available roles: `admin` / `developer` / `viewer`

### 5. Start the development server

```bash
npm run dev
```

---

## Useful Commands

```bash
# Development server
npm run dev

# Lint
npm run lint

# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Prisma
npm run db:generate   # Generate Prisma Client
npm run db:migrate    # Apply migrations
npm run db:studio     # Open Prisma Studio
```

```bash
# Check PostgreSQL status
docker compose -f deploy/docker/docker-compose.yml ps
docker compose -f deploy/docker/docker-compose.yml logs postgres

# Restart PostgreSQL
docker compose -f deploy/docker/docker-compose.yml restart

# Reset all data
docker compose -f deploy/docker/docker-compose.yml down -v
docker compose -f deploy/docker/docker-compose.yml up -d
```

---

## Troubleshooting

**PostgreSQL connection refused**

```bash
docker compose -f deploy/docker/docker-compose.yml ps
```

- Verify `DATABASE_URL` in `.env.local` points to `localhost:5433`
- If there is a port conflict, update both `deploy/docker/docker-compose.yml` and `.env.local`

**Prisma cannot read environment variables**

`prisma.config.ts` reads from `.env.local`. If the file is missing or a value is empty, migrations will fail.

```bash
ls -la .env.local
```

---

## Related

- [../../README.md](../../README.md) — Project overview
- [deployment-docker.md](deployment-docker.md) — Docker Compose deployment
- [deployment-kubernetes.md](deployment-kubernetes.md) — Kubernetes deployment
