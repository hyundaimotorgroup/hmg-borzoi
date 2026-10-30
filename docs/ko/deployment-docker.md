# Docker Compose 배포

단일 서버에 Docker Compose로 hmg-borzoi를 배포하는 가이드입니다. 소규모 팀이나 단순한 운영 환경에 적합합니다.

Kubernetes 배포는 [deployment-kubernetes.md](deployment-kubernetes.md)를 참고하세요.

## 준비물

- Docker 24 이상
- Docker Compose v2
- 빌드된 앱 이미지 (또는 컨테이너 레지스트리 접근 권한)

## 배포 흐름

```
이미지 빌드 → 환경 변수 준비 → DB 마이그레이션 실행 → 앱 기동
```

---

## 1. 이미지 빌드

저장소의 `deploy/docker/Dockerfile`은 기본적으로 공개 npm 레지스트리를 사용하며, 애플리케이션과 마이그레이션 이미지를 모두 빌드합니다. 외부 이미지 레지스트리는 CI 또는 이미지 푸시 전에 설정하고, Dockerfile에 사설 레지스트리 URL이나 자격증명을 추가하지 마세요.

### 빌드

```bash
# 앱 이미지 빌드
docker build --target runner -f deploy/docker/Dockerfile -t borzoi:latest .

# 마이그레이션 이미지 빌드
docker build --target migration -f deploy/docker/Dockerfile -t borzoi-job:latest .
```

동일한 이미지를 레지스트리에 태그하고 푸시하려면 선택 사항인 빌드 스크립트를 사용합니다.

```bash
cp deploy/scripts/build-and-push.sh.example deploy/scripts/build-and-push.sh
# build-and-push.sh에서 REGISTRY_URL, REGISTRY_PROJECT, IMAGE_NAME 수정 후
./deploy/scripts/build-and-push.sh latest all
```

---

## 2. 환경 변수 준비

`.env.prod` 파일을 생성합니다. `.env.local.ko.example`을 참고해 작성하세요.

```bash
cp .env.local.ko.example .env.prod
```

`.env.prod`에 설정할 값:

```env
# PostgreSQL
POSTGRES_PASSWORD=your-strong-password
DATABASE_URL=postgresql://borzoi_user:your-strong-password@postgres:5432/borzoi

# 암호화 키 (openssl rand -hex 32)
ENCRYPTION_KEY=your-32-byte-hex-key

# Alert scheduler 토큰 (openssl rand -hex 32)
# 사용할 이미지
APP_IMAGE=borzoi:latest
JOB_IMAGE=borzoi-job:latest
```

키 생성:

```bash
openssl rand -hex 32
```

---

## 3. 배포

```bash
docker compose -f deploy/docker/docker-compose.prod.yml --env-file .env.prod up -d
```

`migrate` 서비스가 Prisma 마이그레이션을 수행한 후 `app` 서비스가 기동됩니다.

배포 상태 확인:

```bash
docker compose -f deploy/docker/docker-compose.prod.yml ps
docker compose -f deploy/docker/docker-compose.prod.yml logs app
```

---

## 4. 첫 사용자 생성

마이그레이션 완료 후 앱 컨테이너에서 실행합니다.

```bash
docker compose -f deploy/docker/docker-compose.prod.yml exec app \
  node scripts/create-app-user.js \
  --email you@example.com \
  --name "Admin" \
  --password "change-me" \
  --role admin
```

사용 가능한 역할: `admin` / `developer` / `viewer`

---

## 업데이트

```bash
# 새 이미지 빌드
docker build --target runner -t borzoi:latest .
docker build --target migration -t borzoi-job:latest .

# 재배포
docker compose -f deploy/docker/docker-compose.prod.yml --env-file .env.prod up -d
```

---

## 유용한 명령

```bash
# 로그 확인
docker compose -f deploy/docker/docker-compose.prod.yml logs -f app
docker compose -f deploy/docker/docker-compose.prod.yml logs migrate

# 서비스 재시작
docker compose -f deploy/docker/docker-compose.prod.yml restart app

# 중지
docker compose -f deploy/docker/docker-compose.prod.yml down

# 데이터 포함 완전 삭제
docker compose -f deploy/docker/docker-compose.prod.yml down -v
```

---

## 문제 해결

**마이그레이션 실패**

```bash
docker compose -f deploy/docker/docker-compose.prod.yml logs migrate
```

주요 원인: `DATABASE_URL` 오타, `POSTGRES_PASSWORD` 불일치.

**앱이 PostgreSQL에 연결 안 될 때**

`DATABASE_URL`의 호스트가 `postgres` (서비스 이름)인지 확인합니다.
로컬 개발용 `docker-compose.yml`처럼 `localhost:5433`으로 설정하면 안 됩니다.

**포트 변경**

`.env.prod`에 `PORT=8080` 등을 추가하면 포트를 바꿀 수 있습니다.

---

## 관련 문서

- [getting-started.md](getting-started.md) — 로컬 개발 환경
- [deployment-kubernetes.md](deployment-kubernetes.md) — Kubernetes 배포
