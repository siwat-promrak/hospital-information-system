#!/bin/sh
# Container entrypoint: apply migrations, seed baseline data, then start the API.
# `migrate deploy` only applies committed migrations (never generates), and the
# seed is idempotent (upsert by natural key) so both are safe to run on every boot.
set -e

echo "[entrypoint] Applying database migrations (prisma migrate deploy)…"
prisma migrate deploy --schema=./prisma/schema.prisma

echo "[entrypoint] Seeding database (idempotent)…"
node dist-seed/prisma/seed/index.js

echo "[entrypoint] Starting API server…"
exec node dist/main.js
