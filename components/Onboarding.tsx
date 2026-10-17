'use client'

import { useState } from 'react'
import { seedFor } from '@/lib/seed'
import { isCloudConfigured } from '@/lib/supabase'
import { requestPersistence } from '@/lib/photos'
import { Login } from './Login'
import { parseNum, persist } from './ui'

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [goal, setGoal] = useState('')
  const [sessions, setSessions] = useState('4')
  const [mode, setMode] = useState<'start' | 'login'>(isCloudConfigured() ? 'login' : 'start')
  const [busy, setBusy] = useState(false)

  async function start() {
    setBusy(true)
    const ok = await persist(async () => {
      const s = parseNum(sessions)
      await seedFor({
        displayName: name.trim() || 'Yo',
        heightCm: parseNum(height),
        declaredWeightKg: parseNum(weight),
        goalWeightKg: parseNum(goal),
        weeklySessionGoal: s != null && s >= 1 && s <= 7 ? Math.round(s) : 4,
      })
      await requestPersistence()
      return true
    }, 'Listo. Tus datos quedaron en este teléfono.')
    setBusy(false)
    if (ok.ok) onDone()
  }

  return (
    <div className="stack-lg">
      <div className="card brand hero">
        <p className="kicker">Bienvenido</p>
        <h1 style={{ fontSize: 40, marginTop: 6 }}>Lovely Fit</h1>
        <p className="ed" style={{ fontSize: 20, margin: '8px 0 0' }}>Constancia antes que perfección.</p>
      </div>

      {mode === 'start' ? (
        <div className="card stack">
          <h2>Empezar en este teléfono</h2>
          <p className="small muted">
            Cargamos tu perfil, un borrador de rutina A–D, comidas habituales y recordatorios (apagados).
            Todo es editable. Funciona sin conexión.
          </p>
          <label className="field">
            ¿Cómo te llamamos?
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </label>
          <div className="grid2">
            <label className="field">Altura (cm)<input className="input" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
            <label className="field">Peso aprox. (kg)<input className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
            <label className="field">Meta de peso (kg)<input className="input" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
            <label className="field">Sesiones/semana<input className="input" inputMode="numeric" value={sessions} onChange={(e) => setSessions(e.target.value)} /></label>
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>Todo opcional y editable después. El peso aproximado no cuenta como pesaje.</p>
          <button className="btn block" onClick={start} disabled={busy} data-testid="onboard-start">
            {busy ? 'Preparando…' : 'Empezar'}
          </button>
          {isCloudConfigured() && (
            <button className="linkbtn" onClick={() => setMode('login')}>Tengo invitación: entrar con mi cuenta</button>
          )}
        </div>
      ) : (
        <div className="card stack">
          <h2>Entrar con tu cuenta</h2>
          <p className="small muted" style={{ margin: 0 }}>El acceso es por invitación. La primera vez tocá «Crear cuenta» con tu email invitado y una contraseña; si ya usabas la app, traemos tus datos.</p>
          <Login onDone={onDone} />
          <button className="linkbtn" onClick={() => setMode('start')}>Probar sin cuenta (solo en este teléfono)</button>
        </div>
      )}
      <p className="tiny muted" style={{ textAlign: 'center' }}>
        Las rutinas y sugerencias son propuestas para revisar, no indicaciones médicas.
      </p>
    </div>
  )
}
