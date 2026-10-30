# hmg-Borzoi

<p align="center">
  <img src="https://img.shields.io/badge/status-active-brightgreen.svg" alt="Project status: active" />
  <a href="https://opensource.org/licenses/Apache-2.0">
    <img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License: Apache 2.0" />
  </a>
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version 1.0.0" />
</p>

hmg-Borzoi is an open-source administration platform for operating physical ClickHouse clusters. It consolidates monitoring, cluster management, SQL execution, ClickHouse user management, alerting, and audit logs into one operational interface.

## Key Features

- **Dashboard-first operations** — Surface cluster anomalies at a glance
- **Physical cluster model** — PostgreSQL stores metadata; all queries and actions run directly against ClickHouse
- **Multi-layer access control** — Page access, menu visibility, and API authorization as independent layers
- **Performance-optimized** — Two-phase dashboard loading, field-level cache, timeseries cache, ClickHouse client pool, request deduplication

## Quick Start

### Prerequisites

- Node.js 20 or later
- npm 10 or later
- Docker and Docker Compose (for local PostgreSQL)
- A reachable ClickHouse cluster

```bash
git clone https://github.com/hyundaimotorgroup/hmg-borzoi.git
cd hmg-borzoi
npm ci
cp .env.local.example .env.local
# Set ENCRYPTION_KEY and DATABASE_URL in .env.local
docker compose -f deploy/docker/docker-compose.yml up -d
npm run db:generate
npm run db:migrate -- --name init
node scripts/create-app-user.js --email you@example.com --name "Admin" --password "change-me" --role admin
npm run dev
```

Environment examples: [English](.env.local.example) · [한국어](.env.local.ko.example).

Open `http://localhost:3000` and log in with the account you created.

To connect a ClickHouse cluster, sign in as an administrator and use the **Clusters** page to add its connection details. hmg-borzoi encrypts stored credentials with `ENCRYPTION_KEY`.

## Features

| Feature | Description |
|---------|-------------|
| Dashboard | Real-time physical cluster health overview |
| Cluster Detail | Diagnostics — queries, storage, replication, networking, Keeper |
| Database Explorer | Schema browsing with table lineage |
| Query Editor | SQL execution with explain and profile |
| User Management | ClickHouse users, roles, profiles, and grants |
| Alerting | Rule-based alerting with execution history |
| Audit Log | Platform-level audit trail |

## Documentation

| | English | 한국어 |
|--|---------|--------|
| Getting Started | [docs/en/getting-started.md](docs/en/getting-started.md) | [docs/ko/getting-started.md](docs/ko/getting-started.md) |
| Docker Deployment | [docs/en/deployment-docker.md](docs/en/deployment-docker.md) | [docs/ko/deployment-docker.md](docs/ko/deployment-docker.md) |
| Kubernetes Deployment | [docs/en/deployment-kubernetes.md](docs/en/deployment-kubernetes.md) | [docs/ko/deployment-kubernetes.md](docs/ko/deployment-kubernetes.md) |

## Development

```bash
npm run dev          # Development server (Turbopack)
npm run build        # Production build
npm run lint         # Lint
npm run test         # Unit tests
npm run test:e2e     # E2E tests (Playwright)

npm run db:generate  # Generate Prisma Client
npm run db:migrate   # Apply migrations
npm run db:studio    # Prisma Studio
```

## Deployment

Two deployment options are available:

- **Docker Compose** — Single host, simple setup → [docs/en/deployment-docker.md](docs/en/deployment-docker.md)
- **Kubernetes** — Production scale → [docs/en/deployment-kubernetes.md](docs/en/deployment-kubernetes.md)

## Contributing

Contributions are welcome.

Before contributing, please review:

- [Contributing Guide](.github/CONTRIBUTING.md)
- [Contributor License Agreement (Korean)](https://github.com/hyundaimotorgroup/.github/blob/main/legal/CLA-KOR.md)
- [Contributor License Agreement (English)](https://github.com/hyundaimotorgroup/.github/blob/main/legal/CLA-ENG.md)

If CLA verification is enabled, contributors may be required to complete the Contributor License Agreement (CLA) process before their pull request can be merged.

**Commit message format** — this project enforces [Conventional Commits](https://www.conventionalcommits.org/).


## Project Policies

- [Code of Conduct](.github/CODE_OF_CONDUCT.md)
- [Security Policy](.github/SECURITY.md)

## Support

Before creating a new issue, please search existing issues to avoid duplicates.

For bug reports, feature requests, and general project discussions:

- [GitHub Issues](https://github.com/hyundaimotorgroup/hmg-borzoi/issues)
- [Issue Templates](.github/ISSUE_TEMPLATE/)

For security concerns:

- Follow the instructions in [Security Policy](.github/SECURITY.md).


## Releases


Release notes and version history are available in the following locations:
- [Changelog](./CHANGELOG.md)
- [Release Notes](https://github.com/hyundaimotorgroup/hmg-borzoi/releases)

This project follows [Semantic Versioning](https://semver.org/).


## License

This project is licensed under the <a href="https://www.apache.org/licenses/LICENSE-2.0">Apache License 2.0</a>.
See the [LICENSE](LICENSE) file for details.

Third-party license information is in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).

Copyright (c) 2026 Hyundai Motor Group.
