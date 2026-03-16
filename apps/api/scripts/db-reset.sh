#!/usr/bin/env bash
# Reset the database by dropping/recreating via docker exec psql (separate
# connections), then applying migrations with prisma migrate deploy.
#
# This avoids the TimescaleDB "extension already loaded with another version"
# error that occurs when prisma migrate reset drops and recreates the database
# in the same PostgreSQL backend session.
set -euo pipefail

DB_USER="${POSTGRES_USER:-mimir}"
DB_NAME="${POSTGRES_DB:-mimir}"

# Resolve the postgres container (docker compose project name may vary)
PG_CONTAINER=$(docker ps --filter "ancestor=timescale/timescaledb:latest-pg16" --format '{{.Names}}' | head -1)
if [ -z "$PG_CONTAINER" ]; then
  PG_CONTAINER=$(docker ps --filter "name=postgres" --format '{{.Names}}' | head -1)
fi
if [ -z "$PG_CONTAINER" ]; then
  echo "Error: could not find a running PostgreSQL container" >&2
  exit 1
fi

echo "Using container: ${PG_CONTAINER}"

echo "Dropping database \"${DB_NAME}\"..."
docker exec "$PG_CONTAINER" psql -U "$DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";"

echo "Creating database \"${DB_NAME}\"..."
docker exec "$PG_CONTAINER" psql -U "$DB_USER" -d postgres \
  -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";"

echo "Applying migrations..."
prisma migrate deploy

echo "Database reset complete."
