'use client'

import { useState } from 'react'
import { sendLoginCode, verifyLoginCode } from '@/lib/sync'
import { showToast } from './ui'

/**
 * Ingreso con código de 6 dígitos por email (no enlace mágico): en iPhone el
 * enlace abriría Safari, que no comparte sesión con la app instalada.
 */
export function Login({ onDone }: { onDone?: () => void }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    setBusy(true)
    setError('')
    try {
      await sendLoginCode(email.trim())
      setStep('code')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    setBusy(true)
    setError('')
    try {
      await verifyLoginCode(email.trim(), code.trim())
      showToast('Sesión iniciada')
      onDone?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      {step === 'email' ? (
        <>
          <label className="field">
            Email
            <input className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="btn block" disabled={busy || !email.includes('@')} onClick={send}>
            {busy ? 'Enviando…' : 'Enviarme un código'}
          </button>
        </>
      ) : (
        <>
          <p className="small muted">Te mandamos un código a {email}. Puede tardar un minuto; revisá spam.</p>
          <label className="field">
            Código
            <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button className="btn block" disabled={busy || code.trim().length < 6} onClick={verify}>
            {busy ? 'Verificando…' : 'Entrar'}
          </button>
          <button className="linkbtn" onClick={() => setStep('email')}>Cambiar email</button>
        </>
      )}
      {error && <p className="small danger" role="alert">{error}</p>}
    </div>
  )
}
