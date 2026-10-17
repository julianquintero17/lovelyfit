import type { Metadata, Viewport } from 'next'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/pt-sans-narrow/700.css'
import '@fontsource/eb-garamond/400-italic.css'
import './globals.css'
import { AppShell } from '@/components/AppShell'
import { THEME_SCRIPT } from '@/lib/theme'

export const metadata: Metadata = {
  title: 'Lovely Fit',
  description: 'Entrenamiento, comidas y progreso personal.',
  applicationName: 'Lovely Fit',
  appleWebApp: { capable: true, title: 'Lovely Fit', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FEF8EF' },
    { media: '(prefers-color-scheme: dark)', color: '#1E2617' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" data-theme="claro" suppressHydrationWarning>
      <head>
        {/* Tema guardado aplicado antes del primer pintado (sin destello). Ver lib/theme.ts */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
