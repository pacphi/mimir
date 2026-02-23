# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace manifests first so dependency installation is cached
# independently of source changes.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile

# Copy source files
COPY apps/api/tsconfig.json ./apps/api/
COPY apps/api/src ./apps/api/src
COPY apps/api/prisma ./apps/api/prisma
COPY packages/shared ./packages/shared

# Generate Prisma client and compile TypeScript
RUN pnpm --filter=@sindri-console/api exec prisma generate
RUN pnpm --filter=@sindri-console/api run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:24-alpine

# ── Sindri CLI binary (Mode B — CI/production) ────────────────────────────────
# SINDRI_VERSION is set at build time (e.g. docker build --build-arg SINDRI_VERSION=3.0.1)
# In local dev, omit this ARG and instead volume-mount via docker-compose.yml (Mode A).
ARG SINDRI_VERSION=""
ARG TARGETARCH

RUN if [ -n "${SINDRI_VERSION}" ]; then \
      ARCH="$([ "${TARGETARCH}" = "arm64" ] && echo "aarch64" || echo "x86_64")" && \
      ASSET="sindri-v${SINDRI_VERSION}-${ARCH}-unknown-linux-musl.tar.gz" && \
      URL="https://github.com/pacphi/sindri/releases/download/v${SINDRI_VERSION}/${ASSET}" && \
      echo "Downloading sindri ${SINDRI_VERSION} (${ARCH}) from ${URL}" && \
      wget -qO /tmp/sindri.tar.gz "${URL}" && \
      tar -xzf /tmp/sindri.tar.gz -C /usr/local/bin sindri && \
      chmod +x /usr/local/bin/sindri && \
      rm /tmp/sindri.tar.gz && \
      echo "sindri $(sindri version 2>/dev/null || echo 'installed') at /usr/local/bin/sindri"; \
    else \
      echo "SINDRI_VERSION not set — binary will be volume-mounted (Mode A) or found on PATH"; \
    fi

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace manifests and lockfile so pnpm can restore the store layout
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/

# Production-only install (no dev tools, no tsx, no tsc)
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output and Prisma schema from the build stage
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Generate Prisma client against production node_modules
RUN pnpm --filter=@sindri-console/api exec prisma generate

COPY packages/shared/src ./packages/shared/src

WORKDIR /app/apps/api

EXPOSE 3001

# Run pending migrations then start the compiled server
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/index.js"]
