# ──────────────────────────────────────────────────────────────────────────────
# Dockerfile.api — Multi-stage build for NestJS API (@hospital/api)
# ──────────────────────────────────────────────────────────────────────────────
# Build:  docker build -f Dockerfile.api -t hospital-api .
# Run:    docker compose up -d
# ──────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies + build ─────────────────────────────────────
FROM node:20-alpine AS build

# OpenSSL must be present when `prisma generate` runs so it detects the correct
# libssl target (linux-musl-openssl-3.0.x) instead of falling back to a guess.
RUN apk add --no-cache openssl

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

# Copy workspace root files needed for pnpm install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Copy only the api package.json (we don't need web in this image)
COPY apps/api/package.json apps/api/package.json

# Install ALL dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy workspace config + source code
COPY tsconfig.base.json ./
COPY apps/api ./apps/api

# Generate Prisma Client (required for TypeScript to resolve generated types)
RUN cd apps/api && npx prisma generate

# Build the NestJS app
RUN cd apps/api && npx nest build

# Compile the seed (prisma/seed + the src modules it imports) to plain JS so the
# runner can execute it with node — the dev seed uses ts-node, a devDependency
# stripped from the production image. Output lands in apps/api/dist-seed.
RUN cd apps/api && npx tsc -p tsconfig.seed.json

# Create a standalone /deploy folder with production-only, symlink-free node_modules.
# Running this in the build stage reuses the already-warm pnpm store (hard-links
# from it instead of re-downloading), keeping disk usage low. `pnpm deploy` writes
# a self-contained, flat node_modules that Docker can copy safely (the original
# bug was that the symlinked workspace node_modules didn't survive the copy).
RUN pnpm --filter @hospital/api deploy --prod --legacy /deploy

# Overlay the already-generated Prisma client into the deploy node_modules.
# pnpm deploy installs @prisma/client but skips postinstall (so no engine binary).
# Because deploy keeps a virtual store, the real @prisma/client lives at
# .pnpm/@prisma+client@<ver>/node_modules/@prisma/client and resolves the
# generated client as its SIBLING (.pnpm/@prisma+client@<ver>/node_modules/.prisma)
# — NOT the top-level node_modules/.prisma. We mirror the build stage's working
# layout by copying it next to @prisma/client inside the deploy virtual store.
# Globs keep this resilient to the version-hash directory name.
# Also stage dist + prisma schema into /deploy so the runner copies one tree.
RUN set -e \
    && PRISMA_SRC="$(echo /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma)" \
    && PRISMA_DEST_DIR="$(echo /deploy/node_modules/.pnpm/@prisma+client@*/node_modules)" \
    && rm -rf "$PRISMA_DEST_DIR/.prisma" \
    && cp -r "$PRISMA_SRC" "$PRISMA_DEST_DIR/.prisma" \
    && cp -r apps/api/dist /deploy/dist \
    && cp -r apps/api/dist-seed /deploy/dist-seed \
    && cp -r apps/api/prisma /deploy/prisma

# ── Stage 2: Production runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner

# OpenSSL is required by Prisma's engines on Alpine. We also install the prisma
# CLI globally so the entrypoint can run `migrate deploy` on boot — the lean
# pnpm --prod deploy strips the devDependency prisma CLI + its migration engine,
# and a global install pulls the engine matching THIS image's platform/openssl.
RUN apk add --no-cache openssl \
    && npm install -g prisma@5.22.0

WORKDIR /app

# Everything the runner needs comes from the single /deploy tree:
#   node_modules — flat, no symlinks, production only + generated Prisma client
#   dist         — compiled NestJS output
#   prisma       — schema + migrations (applied by the entrypoint at startup)
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /deploy/dist ./dist
COPY --from=build /deploy/dist-seed ./dist-seed
COPY --from=build /deploy/prisma ./prisma

# Entrypoint applies migrations (gated on RUN_MIGRATIONS) then starts the server
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Use non-root user for security
USER node

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]