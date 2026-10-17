'use client'

import { useState } from 'react'
import { sendLoginCode, signInWithPassword, signUpWithPassword, verifyLoginCode } from '@/lib/sync'
import { showToast } from './ui'

type Mode = 'login' | 'signup' | 'code'

/** Email + contraseña. El código por email queda como respaldo (olvidé la contraseña). */
export function Login({ onDone }: { onDone?: () => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const done = () => {
    showToast('Sesión iniciada')
    onDone?.()
  }
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())

  return (
    <form className="stack" onSubmit={(e) => e.preventDefault()}>
      {mode !== 'code' && (
        <div className="seg" role="group" aria-label="Cuenta">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>Entrar</button>
          <button type="button" aria-pressed={mode === 'signup'} onClick={() => setMode('signup')}>Crear cuenta</button>
        </div>
      )}
      <label className="field">
        Email
        <input className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email" />
      </label>

      {mode !== 'code' ? (
        <>
          <label className="field">
            Contraseña {mode === 'signup' && <span className="hint">Mínimo 8 caracteres. El email tiene que estar invitado.</span>}
            <input className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password" />
          </label>
          <button type="submit" className="btn block" disabled={busy || !validEmail || password.length < (mode === 'signup' ? 8 : 1)} data-testid="login-submit"
            onClick={() => run(async () => {
              if (mode === 'login') {
                await signInWithPassword(email, password)
                done()
              } else {
                const r = await signUpWithPassword(email, password)
                if (r === 'signed-in') done()
                else {
                  setInfo('Cuenta creada. Te mandamos un mail para confirmar: tocá el enlace y después volvé acá y entrá con tu contraseña.')
                  setMode('login')
                }
              }
            })}>
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
          <button type="button" className="linkbtn small" style={{ alignSelf: 'center' }} onClick={() => setMode('code')}>Olvidé mi contraseña · entrar con un código</button>
        </>
      ) : (
        <>
          {!codeSent ? (
            <button type="button" className="btn block" disabled={busy || !validEmail} onClick={() => run(async () => {
              await sendLoginCode(email)
              setCodeSent(true)
            })}>{busy ? 'Enviando…' : 'Enviarme un código'}</button>
          ) : (
            <>
              <p className="small muted" style={{ margin: 0 }}>Te mandamos un código a {email}. Puede tardar un minuto; revisá spam. Después podés crear una contraseña nueva en Ajustes.</p>
              <label className="field">
                Código
                <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} />
              </label>
              <button type="submit" className="btn block" disabled={busy || code.trim().length < 6} onClick={() => run(async () => {
                await verifyLoginCode(email, code.trim())
                done()
              })}>{busy ? 'Verificando…' : 'Entrar'}</button>
            </>
          )}
          <button type="button" className="linkbtn small" style={{ alignSelf: 'center' }} onClick={() => { setMode('login'); setCodeSent(false) }}>Volver a email y contraseña</button>
        </>
      )}
      {info && <p className="small" role="status" style={{ margin: 0 }}>{info}</p>}
      {error && <p className="small danger" role="alert" style={{ margin: 0 }}>{error}</p>}
    </form>
  )
}
