#!/usr/bin/env bash
# Prueba la migración contra un Postgres local con auth/storage simulados.
# Uso: PGHOST=/ruta/socket PGPORT=5499 PGUSER=postgres bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
psql -q -c "drop database if exists lovely_fit_test" -c "create database lovely_fit_test"
psql -q -d lovely_fit_test -f supabase/tests/mock_supabase.sql
psql -q -d lovely_fit_test -v ON_ERROR_STOP=1 -f supabase/migrations/0001_lovely_fit.sql
psql -q -d lovely_fit_test -v ON_ERROR_STOP=1 -f supabase/migrations/0002_access.sql
psql -q -d lovely_fit_test -At -v ON_ERROR_STOP=1 -f supabase/tests/rls_lww.sql
