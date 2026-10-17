/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exportación estática: sin servidor propio; Vercel Hobby (o cualquier hosting estático) sirve /out.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // URL y clave *publishable* de Supabase: son públicas por diseño (la seguridad la da RLS).
  // Se pueden sobreescribir con variables de entorno; vacías = modo solo local.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://kplggpxluvjomohtiito.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_R8HsQKJlLEKJwkj9IyjIvw_RoyMZW3Q',
  },
}
export default nextConfig
