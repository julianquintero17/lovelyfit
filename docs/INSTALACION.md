# Instalación

## 1. Publicar (Vercel Hobby, gratis, uso personal no comercial)
1. Subí el repo a GitHub (privado).
2. En vercel.com → *Add New Project* → importá el repo. Framework: Next.js (detecta `output: 'export'`).
   Build command: `npm run build` · Output directory: `out`.
3. Sin variables de entorno la app funciona en modo **solo local**.
4. No compres dominio: usá el `*.vercel.app`.

> Si más adelante se conecta al negocio Lovely Fitness, reevaluar el plan (Hobby es no comercial).

## 2. Conectar Supabase (opcional, para nube y otro dispositivo)
1. Elegí el proyecto (ver pendientes en PRODUCTO.md).
2. SQL Editor → pegá y ejecutá `supabase/migrations/0001_lovely_fit.sql` (crea tablas `fit_*`, RLS, bucket privado `fit-private`).
3. Authentication → Email: dejá activado. En *Email Templates → Magic Link*, incluí el código: `Tu código: {{ .Token }}`.
   (La app pide el código de 6 dígitos.)
4. Authentication → URL configuration: agregá tu URL de Vercel.
5. En Vercel → Settings → Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = URL del proyecto
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = clave **publishable/anon** (nunca la service_role)
6. Redeploy. En la app: Mis datos → Cuenta → email → código. Los datos del teléfono se suben solos.

Límites del plan free: verificá en el panel de Supabase (base, storage, emails de auth por hora). Las fotos se comprimen (~150–300 KB) para cuidar el espacio.

## 3. Instalar en el iPhone
1. Abrí la URL en **Safari** → Compartir → **Agregar a inicio**.
2. Abrí siempre desde el ícono. Safari y la app instalada guardan datos por separado.
3. Mis datos → Respaldo → "pedir persistencia" y exportá respaldos seguido si no usás la nube.

## 4. Desarrollo local
```bash
npm install && npm run dev
```
Variables en `.env.local` (no se commitea).
