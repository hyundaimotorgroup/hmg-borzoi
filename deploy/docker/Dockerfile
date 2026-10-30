# Generic multi-stage build for the Next.js application.
FROM node:20-alpine AS base

FROM base AS builder
RUN apk add --no-cache ca-certificates libc6-compat openssl
WORKDIR /app

# Use the public npm registry configured by npm by default. Supply a registry
# with BuildKit secrets or a build-time npm configuration when one is needed.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
RUN node scripts/sync-monaco-assets.mjs && \
    DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    ENCRYPTION_KEY="dummy-encryption-key-for-build-only-32chars" \
    npm run build

# The application disables the Next.js Image Optimizer (see next.config.js),
# so its statically traced sharp native packages are not needed at runtime.
RUN rm -rf .next/standalone/node_modules/sharp \
           .next/standalone/node_modules/@img/colour \
           .next/standalone/node_modules/@img/sharp-*

FROM base AS runner
RUN apk add --no-cache ca-certificates openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY LICENSE THIRD_PARTY_NOTICES ./

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

# Image for running Prisma migrations. Build with --target migration.
FROM base AS migration
RUN apk add --no-cache ca-certificates libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY LICENSE THIRD_PARTY_NOTICES ./

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
RUN npm prune --omit=dev --omit=optional
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs
