# 시작하기

로컬 개발 환경을 구성하고 개발 서버를 실행하는 절차입니다.

운영 배포는 [deployment-docker.md](deployment-docker.md) 또는 [deployment-kubernetes.md](deployment-kubernetes.md)를 참고하세요.

## 준비물

- Node.js 20 이상
- npm
- Docker / Docker Compose (로컬 PostgreSQL 실행용)
- 운영 중인 ClickHouse 인스턴스

---

## 빠른 시작

```bash
git clone https://github.com/hyundaimotorgroup/hmg-borzoi.git
cd hmg-borzoi
npm install
cp .env.local.ko.example .env.local
# .env.local에서 ENCRYPTION_KEY와 DATABASE_URL 설정
docker compose -f deploy/docker/docker-compose.yml up -d
npm run db:generate
npm run db:migrate -- --name init
node scripts/create-app-user.js --email you@example.com --name "Admin" --password "change-me" --role admin
npm run dev
```

`http://localhost:3000`에서 생성한 계정으로 로그인합니다.

---

## 단계별 설명

### 1. 환경 변수 준비

```bash
cp .env.local.ko.example .env.local
```

`.env.local`에서 다음 값을 설정합니다.

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 (기본값은 로컬 Docker 기준) |
| `ENCRYPTION_KEY` | ClickHouse 자격증명 암호화 키 (아래 명령으로 생성) |
| `CRON_SECRET` | Alert scheduler 인증 토큰 (아래 명령으로 생성) |

```bash
# ENCRYPTION_KEY, CRON_SECRET 생성
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. PostgreSQL 실행

```bash
docker compose -f deploy/docker/docker-compose.yml up -d
```

| 항목 | 기본값 |
|------|--------|
| host | `localhost` |
| port | `5433` |
| database | `borzoi` |
| user | `borzoi_user` |

### 3. DB 마이그레이션

```bash
npm run db:generate
npm run db:migrate -- --name init
```

이미 마이그레이션 이력이 있는 DB라면 `--name init` 없이 실행합니다.

### 4. 첫 사용자 생성

```bash
node scripts/create-app-user.js \
  --email you@example.com \
  --name "Admin" \
  --password "change-me" \
  --role admin
```

사용 가능한 역할: `admin` / `developer` / `viewer`

### 5. 개발 서버 실행

```bash
npm run dev
```

---

## 유용한 명령

```bash
# 개발 서버
npm run dev

# 린트
npm run lint

# 유닛 테스트
npm run test

# E2E 테스트
npm run test:e2e

# Prisma
npm run db:generate   # Prisma Client 생성
npm run db:migrate    # 마이그레이션 적용
npm run db:studio     # Prisma Studio UI
```

```bash
# PostgreSQL 상태 확인
docker compose -f deploy/docker/docker-compose.yml ps
docker compose -f deploy/docker/docker-compose.yml logs postgres

# PostgreSQL 재시작
docker compose -f deploy/docker/docker-compose.yml restart

# 데이터 초기화
docker compose -f deploy/docker/docker-compose.yml down -v
docker compose -f deploy/docker/docker-compose.yml up -d
```

---

## 문제 해결

**PostgreSQL 연결이 안 될 때**

```bash
docker compose -f deploy/docker/docker-compose.yml ps
```

- `.env.local`의 `DATABASE_URL`이 `localhost:5433`을 가리키는지 확인
- 포트 충돌 시 `deploy/docker/docker-compose.yml`과 `.env.local` 모두 수정

**Prisma가 환경 변수를 못 읽을 때**

`prisma.config.ts`가 `.env.local`을 읽으므로, 파일이 없거나 값이 비어 있으면 실패합니다.

```bash
ls -la .env.local
```

---

## 관련 문서

- [../../README.md](../../README.md) — 프로젝트 개요
- [deployment-docker.md](deployment-docker.md) — Docker Compose 배포
- [deployment-kubernetes.md](deployment-kubernetes.md) — Kubernetes 배포
