-- Clave estable del catálogo base para completar ejercicios sin duplicar.
alter table public.fit_exercises add column if not exists catalog_key text;
