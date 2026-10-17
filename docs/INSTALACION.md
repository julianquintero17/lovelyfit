# Instalación

## 1. Publicar (Vercel Hobby, gratis, uso personal no comercial)
1. Subí el repo a GitHub (privado).
2. En vercel.com → *Add New Project* → importá el repo. Framework: Next.js (detecta `output: 'export'`).
   Build command: `npm run build` · Output directory: `out`.
3. Sin variables de entorno la app funciona en modo **solo local**.
4. No compres dominio: usá el `*.vercel.app`.

> Si más adelante se conecta al negocio Lovely Fitness, reevaluar el plan (Hobby es no comercial).

## 2. Supabase
La URL y la clave *publishable* ya vienen en `next.config.mjs` (son públicas por diseño; protege RLS), así que
en Vercel no hace falta cargar variables. Para otro proyecto, definí `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY`; vacías = modo solo local.

1. Aplicá en orden `supabase/migrations/0001_lovely_fit.sql` y `0002_access.sql`.
2. Creá el primer admin: `insert into public.fit_invites (email, role) values ('tu@email.com', 'admin');`
3. Authentication → Email Templates → Magic Link: agregá `Tu código: {{ .Token }}` (la app pide el código).
4. Authentication → URL Configuration: agregá la URL de Vercel en Redirect URLs.
5. Desde la app, el admin invita al resto en Mis datos → Equipo y accesos.

## 3. Instalar en el iPhone
1. Abrí la URL en **Safari** → Compartir → **Agregar a inicio**.
2. Abrí siempre desde el ícono. Safari y la app instalada guardan datos por separado.
3. Mis datos → Respaldo → "pedir persistencia" y exportá respaldos seguido si no usás la nube.

## 4. Desarrollo local
```bash
npm install && npm run dev
```
Variables en `.env.local` (no se commitea).
