# Kubernetes 배포

Kubernetes 클러스터에 hmg-borzoi를 배포하는 가이드입니다.

Docker Compose 배포는 [deployment-docker.md](deployment-docker.md)를 참고하세요.

## 준비물

- kubectl (클러스터에 연결된 상태)
- 컨테이너 레지스트리 접근 권한
- Docker (이미지 빌드용)

## 배포 파일 구조

```
deploy/
├── docker/
│   └── Dockerfile              # 커밋된 프로덕션 멀티스테이지 빌드 파일
├── k8s/
│   ├── configmap.yaml.example  # 앱 비민감 환경 변수 템플릿
│   ├── secret.yaml.example     # 커밋된 Secret 템플릿; 복사해 만든 파일은 ignore됨
│   ├── deployment.yaml.example # Deployment 템플릿 (복사 후 수정)
│   ├── ingress.yaml.example    # Ingress 템플릿 (복사 후 수정)
│   ├── prisma-migration-job.yaml.example
│   ├── service.yaml            # ClusterIP Service
│   ├── postgres-configmap.yaml # in-cluster PostgreSQL 설정
│   ├── postgres-service.yaml
│   └── postgres-statefulset.yaml
└── scripts/
    ├── build-and-push.sh.example  # 빌드 스크립트 템플릿
    ├── build-and-push.sh          # 실제 사용 파일 (gitignore)
    ├── deploy.sh.example          # 배포 스크립트 템플릿
    └── deploy.sh                  # 실제 사용 파일 (gitignore)
```

> 기본 Kubernetes namespace는 `borzoi`입니다. 다른 namespace에 배포하려면 `deploy.sh`에서 `K8S_NAMESPACE`를 재정의하세요.

---

## 마이그레이션 흐름

Kubernetes에서 Prisma 마이그레이션은 **deployment.yaml의 initContainer**로 실행됩니다.

```
Pod 기동 순서:
  1. wait-for-postgres (initContainer) — PostgreSQL 접속 가능 여부를 폴링
  2. prisma-migrate   (initContainer) — npx prisma migrate deploy 실행 (Job 이미지 사용)
  3. borzoi (메인 컨테이너) — Next.js 앱 기동
```

- initContainer가 순서대로 모두 완료되어야 메인 컨테이너가 기동됩니다.
- Pod가 재시작될 때마다 initContainer가 재실행됩니다 (`migrate deploy`는 멱등이므로 안전합니다).
- `prisma-migration-job.yaml`은 마이그레이션만 단독으로 실행하거나 검증할 때 사용하는 별도 Job입니다 (일반 배포에는 불필요).

---

## 1. 배포 스크립트·매니페스트 설정

`.example` 파일을 복사한 뒤 환경에 맞게 수정합니다.

```bash
# 스크립트
cp deploy/scripts/build-and-push.sh.example deploy/scripts/build-and-push.sh
cp deploy/scripts/deploy.sh.example deploy/scripts/deploy.sh

# K8s 매니페스트
cp deploy/k8s/configmap.yaml.example deploy/k8s/configmap.yaml
cp deploy/k8s/deployment.yaml.example deploy/k8s/deployment.yaml
cp deploy/k8s/ingress.yaml.example deploy/k8s/ingress.yaml
cp deploy/k8s/prisma-migration-job.yaml.example deploy/k8s/prisma-migration-job.yaml
```

`build-and-push.sh`에서 수정할 값:

```bash
REGISTRY_URL="your-registry.example.com"
REGISTRY_PROJECT="your-project"
IMAGE_NAME="borzoi"
JOB_IMAGE_NAME="borzoi-job"
```

`deployment.yaml`, `ingress.yaml`, `prisma-migration-job.yaml`의 이미지 URL과 호스트도 수정합니다.

---

## 2. Secret 생성

`deploy/k8s/secret.yaml.example`을 복사해 값을 채운 뒤 적용합니다.

```bash
cp deploy/k8s/secret.yaml.example deploy/k8s/secret.yaml
# deploy/k8s/secret.yaml 편집 후:
kubectl apply -f deploy/k8s/secret.yaml
```

> `secret.yaml`은 `.gitignore`에 등록되어 있어 커밋되지 않습니다.

키 생성:

```bash
openssl rand -hex 32   # ENCRYPTION_KEY 생성
```

컨테이너 레지스트리 pull secret:

```bash
kubectl create secret docker-registry registry-secret \
  --docker-server=your-registry.example.com \
  --docker-username=your-username \
  --docker-password=your-password \
  -n borzoi
```

---

## 3. 이미지 빌드 및 푸시

```bash
export REGISTRY_PASSWORD='your-password'
./deploy/scripts/build-and-push.sh latest all
```

특정 태그로 빌드:

```bash
./deploy/scripts/build-and-push.sh v1.0.0 all
```

---

## 4. 배포

### PostgreSQL (in-cluster 사용 시)

외부 PostgreSQL을 사용하는 경우 이 단계를 건너뜁니다.

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

`DATABASE_URL` 예시:

```
postgresql://borzoi_user:your-password@postgres:5432/borzoi
```

### 앱 배포

```bash
./deploy/scripts/deploy.sh
```

`deploy.sh`가 수행하는 작업:

1. namespace 생성/확인
2. 레지스트리 pull secret 생성/확인
3. `configmap.yaml`, `ingress.yaml`, `service.yaml`, `deployment.yaml` 순서대로 적용
4. rollout 완료 대기

> `:latest` 같은 mutable tag는 `kubectl rollout restart`를 자동 실행합니다.

---

## 5. 첫 사용자 생성

배포 완료 후 앱 Pod에서 실행합니다.

```bash
kubectl get pods -n borzoi -l app=borzoi

kubectl exec -it <pod-name> -n borzoi -- \
  node scripts/create-app-user.js \
  --email you@example.com \
  --name "Admin" \
  --password "change-me" \
  --role admin
```

사용 가능한 역할: `admin` / `developer` / `viewer`

---

## 배포 확인

```bash
# 전체 리소스
kubectl get all -n borzoi

# rollout 상태
kubectl rollout status deployment/borzoi -n borzoi

# 앱 로그
kubectl logs -f deployment/borzoi -n borzoi

# migration initContainer 로그 (배포 중 또는 실패 시 확인)
kubectl logs -l app=borzoi -c prisma-migrate -n borzoi

# 로컬 접근
kubectl port-forward svc/borzoi 3000:80 -n borzoi
```

---

## 일반 재배포

```bash
export REGISTRY_PASSWORD='your-password'
./deploy/scripts/build-and-push.sh latest all
./deploy/scripts/deploy.sh
```

---

## 수동 마이그레이션 Job

마이그레이션만 별도로 실행하거나 검증하고 싶을 때 사용합니다. 일반 배포 시에는 필요하지 않습니다.

```bash
kubectl apply -f deploy/k8s/prisma-migration-job.yaml -n borzoi
kubectl logs job/prisma-migrate -n borzoi
```

---

## 문제 해결

**`wait-for-postgres` initContainer에서 멈출 때**

```bash
kubectl get svc,pods -n borzoi | grep postgres
kubectl logs -l app=borzoi -c wait-for-postgres -n borzoi
```

**`prisma-migrate` 실패**

```bash
kubectl logs -l app=borzoi -c prisma-migrate -n borzoi
```

주요 원인: `DATABASE_URL` 오타, PostgreSQL 권한 문제, 이미지 태그 불일치.

**새 이미지가 반영되지 않을 때**

```bash
kubectl rollout restart deployment/borzoi -n borzoi
```

---

## 관련 문서

- [getting-started.md](getting-started.md) — 로컬 개발 환경
- [deployment-docker.md](deployment-docker.md) — Docker Compose 배포
