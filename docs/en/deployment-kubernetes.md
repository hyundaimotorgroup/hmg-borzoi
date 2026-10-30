# Kubernetes Deployment

Deploy hmg-borzoi to a Kubernetes cluster.

For Docker Compose deployment, see [deployment-docker.md](deployment-docker.md).

## Prerequisites

- kubectl connected to your target cluster
- Access to a container registry
- Docker (for building images)

## Deploy File Structure

```
deploy/
├── docker/
│   └── Dockerfile              # Committed production multi-stage build
├── k8s/
│   ├── configmap.yaml.example  # Non-sensitive app environment template
│   ├── secret.yaml.example     # Committed secret template; copy output is ignored
│   ├── deployment.yaml.example # Deployment template (copy and customize)
│   ├── ingress.yaml.example    # Ingress template (copy and customize)
│   ├── prisma-migration-job.yaml.example
│   ├── service.yaml            # ClusterIP Service
│   ├── postgres-configmap.yaml # In-cluster PostgreSQL config
│   ├── postgres-service.yaml
│   └── postgres-statefulset.yaml
└── scripts/
    ├── build-and-push.sh.example  # Build script template
    ├── build-and-push.sh          # Active file (gitignored)
    ├── deploy.sh.example          # Deploy script template
    └── deploy.sh                  # Active file (gitignored)
```

> The default Kubernetes namespace is `borzoi`. Override `K8S_NAMESPACE` in `deploy.sh` when deploying to another namespace.

---

## Migration Flow

In Kubernetes, Prisma migrations run as **initContainers inside deployment.yaml** — not as a separate Job.

```
Pod startup order:
  1. wait-for-postgres (initContainer) — polls until PostgreSQL accepts connections
  2. prisma-migrate   (initContainer) — runs npx prisma migrate deploy (uses Job image)
  3. borzoi (main container) — starts the Next.js app
```

- Both initContainers must complete successfully before the main container starts.
- On every Pod restart, initContainers re-run (`migrate deploy` is idempotent, so this is safe).
- `prisma-migration-job.yaml` is a standalone Job for running or validating migrations independently — it is not needed for normal deployments.

---

## 1. Configure Scripts and Manifests

Copy the `.example` files and customize them for your environment:

```bash
# Scripts
cp deploy/scripts/build-and-push.sh.example deploy/scripts/build-and-push.sh
cp deploy/scripts/deploy.sh.example deploy/scripts/deploy.sh

# K8s manifests
cp deploy/k8s/configmap.yaml.example deploy/k8s/configmap.yaml
cp deploy/k8s/deployment.yaml.example deploy/k8s/deployment.yaml
cp deploy/k8s/ingress.yaml.example deploy/k8s/ingress.yaml
cp deploy/k8s/prisma-migration-job.yaml.example deploy/k8s/prisma-migration-job.yaml
```

Values to update in `build-and-push.sh`:

```bash
REGISTRY_URL="your-registry.example.com"
REGISTRY_PROJECT="your-project"
IMAGE_NAME="borzoi"
JOB_IMAGE_NAME="borzoi-job"
```

Also update the image URLs and host in `deployment.yaml`, `ingress.yaml`, and `prisma-migration-job.yaml`.

---

## 2. Create Secrets

Copy `deploy/k8s/secret.yaml.example`, fill in values, and apply:

```bash
cp deploy/k8s/secret.yaml.example deploy/k8s/secret.yaml
# Edit deploy/k8s/secret.yaml, then:
kubectl apply -f deploy/k8s/secret.yaml
```

> `secret.yaml` is listed in `.gitignore` and will not be committed.

Generate secret values:

```bash
openssl rand -hex 32   # Use for ENCRYPTION_KEY
```

Create the registry pull secret:

```bash
kubectl create secret docker-registry registry-secret \
  --docker-server=your-registry.example.com \
  --docker-username=your-username \
  --docker-password=your-password \
  -n borzoi
```

---

## 3. Build and Push Images

```bash
export REGISTRY_PASSWORD='your-password'
./deploy/scripts/build-and-push.sh latest all
```

Build with a specific tag:

```bash
./deploy/scripts/build-and-push.sh v1.0.0 all
```

---

## 4. Deploy

### PostgreSQL (in-cluster, optional)

Skip this section if you are using an external PostgreSQL instance.

```bash
kubectl create namespace borzoi --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic postgres-secrets \
  --from-literal=postgres-user=borzoi_user \
  --from-literal=postgres-password='your-password' \
  -n borzoi

kubectl apply -f deploy/k8s/postgres-configmap.yaml
kubectl apply -f deploy/k8s/postgres-service.yaml
kubectl apply -f deploy/k8s/postgres-statefulset.yaml
```

`DATABASE_URL` for in-cluster PostgreSQL:

```
postgresql://borzoi_user:your-password@postgres:5432/borzoi
```

### Deploy the App

```bash
./deploy/scripts/deploy.sh
```

`deploy.sh` handles:

1. Create/confirm namespace
2. Create/confirm registry pull secret
3. Apply `configmap.yaml`, `ingress.yaml`, `service.yaml`, `deployment.yaml` in order
4. Wait for rollout to complete

> When using a mutable tag like `:latest`, `kubectl rollout restart` is run automatically.

---

## 5. Create the First User

Run this inside the app Pod after deployment completes:

```bash
kubectl get pods -n borzoi -l app=borzoi

kubectl exec -it <pod-name> -n borzoi -- \
  node scripts/create-app-user.js \
  --email you@example.com \
  --name "Admin" \
  --password "change-me" \
  --role admin
```

Available roles: `admin` / `developer` / `viewer`

---

## Verify Deployment

```bash
# All resources
kubectl get all -n borzoi

# Rollout status
kubectl rollout status deployment/borzoi -n borzoi

# App logs
kubectl logs -f deployment/borzoi -n borzoi

# Migration initContainer logs (check during deploy or on failure)
kubectl logs -l app=borzoi -c prisma-migrate -n borzoi

# Local access via port-forward
kubectl port-forward svc/borzoi 3000:80 -n borzoi
```

---

## Standard Redeployment

```bash
export REGISTRY_PASSWORD='your-password'
./deploy/scripts/build-and-push.sh latest all
./deploy/scripts/deploy.sh
```

---

## Manual Migration Job

Use this to run or validate migrations independently. Not needed for normal deployments.

```bash
kubectl apply -f deploy/k8s/prisma-migration-job.yaml -n borzoi
kubectl logs job/prisma-migrate -n borzoi
```

---

## Troubleshooting

**`wait-for-postgres` initContainer is stuck**

```bash
kubectl get svc,pods -n borzoi | grep postgres
kubectl logs -l app=borzoi -c wait-for-postgres -n borzoi
```

**`prisma-migrate` fails**

```bash
kubectl logs -l app=borzoi -c prisma-migrate -n borzoi
```

Common causes: typo in `DATABASE_URL`, missing PostgreSQL permissions, image tag mismatch.

**New image not applied**

```bash
kubectl rollout restart deployment/borzoi -n borzoi
```

---

## Related

- [getting-started.md](getting-started.md) — Local development
- [deployment-docker.md](deployment-docker.md) — Docker Compose deployment
