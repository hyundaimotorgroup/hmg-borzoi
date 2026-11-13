# hmg-borzoi Helm Chart

Helm chart for deploying [hmg-borzoi](https://github.com/hyundaimotorgroup/hmg-borzoi) to Kubernetes.
It is the Helm equivalent of the plain manifests in `deploy/k8s/`.

## What it deploys

| Resource | Notes |
|----------|-------|
| Deployment | Next.js app on port 3000, `/api/health` probes, `prisma-migrate` initContainer |
| Service | ClusterIP, port 80 → 3000 |
| ConfigMap | Non-sensitive environment variables from `config` |
| Secret | `database-url`, `encryption-key`, `oidc-client-secret` (skipped with `secret.existingSecret`) |
| ServiceAccount | Token automount disabled |
| Ingress | Optional (`ingress.enabled`) |
| PostgreSQL StatefulSet, Service, Secret | Optional (`postgresql.enabled`); use an external PostgreSQL for production |

## Prerequisites

- Kubernetes >= 1.25 and Helm 3.8+
- The application image and the migration image (`--target migration`) pushed to a registry you control.
  See [docs/en/deployment-kubernetes.md](../../../docs/en/deployment-kubernetes.md).

## Install

```bash
# External PostgreSQL
helm install hmg-borzoi deploy/helm/hmg-borzoi \
  --namespace hmg-borzoi --create-namespace \
  --set image.repository=your-registry.example.com/your-project/hmg-borzoi \
  --set migration.image.repository=your-registry.example.com/your-project/hmg-borzoi-job \
  --set secret.databaseUrl='postgresql://USER:PASSWORD@HOST:5432/DB_NAME' \
  --set secret.encryptionKey="$(openssl rand -hex 32)"
```

Keep real values in a private values file instead of the command line, and do not commit it:

```bash
helm install hmg-borzoi deploy/helm/hmg-borzoi -n hmg-borzoi --create-namespace -f my-values.yaml
```

### In-cluster PostgreSQL (evaluation)

```bash
helm install hmg-borzoi deploy/helm/hmg-borzoi -n hmg-borzoi --create-namespace \
  -f my-values.yaml \
  --set postgresql.enabled=true \
  --set postgresql.auth.password='change-me'
```

`DATABASE_URL` is then built automatically. Persistent data lives in a PVC that is **not** deleted by `helm uninstall`.

### Managing Secrets yourself

Create a Secret with keys `database-url`, `encryption-key` and, when OIDC is on, `oidc-client-secret`,
then set `secret.existingSecret`. The chart will not create or template any sensitive value.

```bash
kubectl create secret generic hmg-borzoi-secrets -n hmg-borzoi \
  --from-literal=database-url='postgresql://USER:PASSWORD@HOST:5432/DB_NAME' \
  --from-literal=encryption-key="$(openssl rand -hex 32)" \
  --from-literal=oidc-client-secret=''
```

## First user

```bash
kubectl exec -it deploy/hmg-borzoi -n hmg-borzoi -- \
  node scripts/create-app-user.js --email you@example.com --name "Admin" --password "change-me" --role admin
```

## Key values

| Key | Default | Description |
|-----|---------|-------------|
| `revisionHistoryLimit` | `3` | Old ReplicaSets kept for rollback (Kubernetes default is 10) |
| `image.repository` / `image.tag` | placeholder / `appVersion` | Application image |
| `migration.enabled` | `true` | Run `prisma migrate deploy` in an initContainer |
| `migration.image.*` | placeholder / `appVersion` | Migration image |
| `config.*` | see `values.yaml` | Environment variables rendered into the ConfigMap |
| `secret.existingSecret` | `""` | Use a pre-created Secret |
| `secret.databaseUrl` | `""` | PostgreSQL connection string |
| `secret.encryptionKey` | `""` | Required unless `existingSecret` is set. Changing it makes stored ClickHouse credentials unreadable |
| `ingress.enabled` | `false` | Create an Ingress |
| `postgresql.enabled` | `false` | Deploy a single-replica PostgreSQL StatefulSet |
| `dnsConfig` | `{}` | Pod DNS options, e.g. lower `ndots` |
| `extraEnv` | `NODE_OPTIONS` | Extra container environment variables |

When `config.AUTH_OIDC_ENABLED` is `"true"`, the chart injects `AUTH_OIDC_CLIENT_SECRET` from the Secret.

## Notes

- Pods roll automatically when the ConfigMap or chart-managed Secret changes.
- Migrations run on every pod start; `migrate deploy` is idempotent.
- With more than one replica, startup migrations may run concurrently. Prisma takes an advisory lock, so this is safe.

## Validate

```bash
helm lint deploy/helm/hmg-borzoi --set secret.databaseUrl=postgresql://u:p@h:5432/d --set secret.encryptionKey=$(openssl rand -hex 32)
```
