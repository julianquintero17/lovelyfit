'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { IconMeal, IconProgress, IconSettings, IconToday, IconTrain } from './Icons'
import { Toaster } from './ui'
import { SyncBadge } from './SyncBadge'
import { startSyncLoop } from '@/lib/sync'
import { getDB, getMeta } from '@/lib/db'
import { Onboarding } from './Onboarding'
import { AppLock } from './AppLock'

const NAV = [
  { href: '/', label: 'Hoy', Icon: IconToday },
  { href: '/entrenar/', label: 'Entrenar', Icon: IconTrain },
  { href: '/comidas/', label: 'Comidas', Icon: IconMeal },
  { href: '/progreso/', label: 'Progreso', Icon: IconProgress },
]

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() || '/'
  const [ready, setReady] = useState<'loading' | 'onboard' | 'ok' | 'error'>('loading')
  const [err, setErr] = useState('')

  useEffect(() => {
    getMeta<boolean>('seeded')
      .then(async (seeded) => {
        // "seeded" o datos traídos de la nube: ambos cuentan como listo
        const profiles = await getDB().profiles.count()
        setReady(seeded || profiles > 0 ? 'ok' : 'onboard')
        startSyncLoop()
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : String(e))
        setReady('error')
      })
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      // Tras un deploy, el SW nuevo toma control: recargar para no mezclar archivos viejos y nuevos.
      // Seguro incluso a mitad de sesión: todo ya está guardado en el teléfono.
      const hadController = !!navigator.serviceWorker.controller
      navigator.serviceWorker.addEventListener('controllerchange', () => hadController && location.reload())
      navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW', e))
    }
  }, [])

  const active = (href: string) => (href === '/' ? path === '/' || path === '/index.html' : path.startsWith(href.replace(/\/$/, '')))

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Lovely Fit, inicio">
          <span className="brand-dot" aria-hidden />
          Lovely Fit
        </Link>
        <span className="spacer" />
        <SyncBadge />
        <Link href="/datos/" className="iconbtn" aria-label="Ajustes" aria-current={path.startsWith('/datos') ? 'page' : undefined}>
          <IconSettings />
        </Link>
      </header>
      <main className="main">
        {ready === 'loading' && <p className="empty">Cargando…</p>}
        {ready === 'error' && (
          <div className="card" role="alert">
            <h2>No se pudo abrir el almacenamiento local</h2>
            <p className="small">
              Sin almacenamiento no se puede guardar nada. En Safari, revisá que no estés en navegación privada.
              Detalle: {err}
            </p>
          </div>
        )}
        {ready === 'onboard' && <Onboarding onDone={() => setReady('ok')} />}
        {ready === 'ok' && children}
      </main>
      <nav className="bottomnav" aria-label="Principal">
        {NAV.map(({ href, label, Icon }) => (
          <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}>
            <Icon />
            {label}
          </Link>
        ))}
      </nav>
      <Toaster />
      <AppLock />
    </div>
  )
}
