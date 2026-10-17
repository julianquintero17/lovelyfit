'use client'

import { useEffect, useState } from 'react'
import { disableLock, getLock, LOCK_AFTER_MS, unlock } from '@/lib/applock'
import { Login } from './Login'
import { isCloudConfigured } from '@/lib/supabase'

/** Pantalla de bloqueo: al abrir la app y tras 5 min en segundo plano. */
export function AppLock() {
  const [locked, setLocked] = useState(false)
  const [failed, setFailed] = useState(0)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    if (getLock()) setLocked(true)
    let hiddenAt = 0
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (getLock() && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) setLocked(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  if (!locked) return null

  async function tryUnlock() {
    if (await unlock()) {
      setLocked(false)
      setFailed(0)
    } else setFailed((n) => n + 1)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="App bloqueada" style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'var(--cream)', display: 'grid', placeItems: 'center', padding: 24,
    }}>
      <div className="stack-lg" style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <div className="brand" style={{ justifyContent: 'center', fontSize: 28 }}><span className="brand-dot" aria-hidden />Lovely Fit</div>
        {!fallback ? (
          <>
            <button className="btn block" onClick={tryUnlock} autoFocus data-testid="unlock">Desbloquear con Face ID</button>
            {failed > 0 && <p className="small danger" role="alert" style={{ margin: 0 }}>No se pudo verificar. Probá de nuevo.</p>}
            {failed > 1 && isCloudConfigured() && (
              <button className="linkbtn" style={{ alignSelf: 'center' }} onClick={() => setFallback(true)}>Entrar con mi contraseña</button>
            )}
          </>
        ) : (
          <div className="card stack" style={{ textAlign: 'left' }}>
            <p className="small muted" style={{ margin: 0 }}>Al entrar con tu contraseña se desactiva el bloqueo; podés volver a activarlo en Mis datos.</p>
            <Login onDone={() => { disableLock(); setLocked(false) }} />
          </div>
        )}
      </div>
    </div>
  )
}
