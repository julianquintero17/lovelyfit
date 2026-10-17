/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exportación estática: sin servidor propio; Vercel Hobby (o cualquier hosting estático) sirve /out.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
}
export default nextConfig
