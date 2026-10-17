'use client'

import { useEffect, useState } from 'react'
import { update } from '@/lib/db'
import { weekdayShort } from '@/lib/dates'
import { exportBackup, importBackup, wipeLocal } from '@/lib/backup'
import { useProfile, useRows, useSyncStatus } from '@/lib/hooks'
import { requestPersistence, storageEstimate } from '@/lib/photos'
import { isCloudConfigured } from '@/lib/supabase'
import { countPending, requestSync, signOut } from '@/lib/sync'
import { disableLock, enableLock, getLock, lockSupported } from '@/lib/applock'
import { dayKey } from '@/lib/dates'
import Link from 'next/link'
import type { Profile, Reminder } from '@/lib/types'
import { Login } from '@/components/Login'
import { parseNum, persist, showToast } from '@/components/ui'

export default function MyDataPage() {
  const { profile } = useProfile()
  if (profile === undefined) return <p className="empty">Cargando…</p>
  return (
    <div className="stack-lg">
      <h1>Mis datos</h1>
      {profile && <ProfileCard profile={profile} />}
      <AccountCard />
      <SecurityCard />
      <BackupCard />
      <RemindersCard />
      <IntegrationsCard />
      <InstallCard />
      <div className="card dashed small muted">
        Lovely Fit no reemplaza indicaciones médicas ni profesionales. Las rutinas y sugerencias son propuestas para revisar.
        No se estima salud ni composición corporal a partir de fotos.
      </div>
      <DangerCard />
    </div>
  )
}

function ProfileCard({ profile }: { profile: Profile }) {
  const [f, setF] = useState({
    displayName: profile.displayName,
    ageDeclared: profile.ageDeclared?.toString() ?? '',
    heightCm: profile.heightCm?.toString() ?? '',
    goalWeightKg: profile.goalWeightKg?.toString() ?? '',
    weeklySessionGoal: String(profile.weeklySessionGoal),
    weighInEveryDays: String(profile.weighInEveryDays),
    preferredTrainingTime: profile.preferredTrainingTime,
    fallbackTrainingTime: profile.fallbackTrainingTime,
    workStart: profile.workStart,
    workEnd: profile.workEnd,
    weekdayStepGoal: profile.weekdayStepGoal?.toString() ?? '',
    healthNotes: profile.healthNotes,
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const goal = parseNum(f.weeklySessionGoal)

  async function save() {
    await persist(() => update<Profile>('profiles', profile.id, {
      displayName: f.displayName.trim() || profile.displayName,
      ageDeclared: parseNum(f.ageDeclared),
      heightCm: parseNum(f.heightCm),
      goalWeightKg: parseNum(f.goalWeightKg),
      weeklySessionGoal: goal != null && goal >= 1 && goal <= 7 ? Math.round(goal) : profile.weeklySessionGoal,
      weighInEveryDays: Math.max(1, Math.round(parseNum(f.weighInEveryDays) ?? profile.weighInEveryDays)),
      preferredTrainingTime: f.preferredTrainingTime,
      fallbackTrainingTime: f.fallbackTrainingTime,
      workStart: f.workStart,
      workEnd: f.workEnd,
      weekdayStepGoal: f.weekdayStepGoal.trim() === '' ? null : Math.round(parseNum(f.weekdayStepGoal) ?? 0) || null,
      healthNotes: f.healthNotes,
    }), 'Perfil guardado')
  }

  return (
    <section className="card stack" id="perfil">
      <h2>Perfil</h2>
      <div className="grid2">
        <label className="field">Nombre<input className="input" value={f.displayName} onChange={set('displayName')} /></label>
        <label className="field">Edad<input className="input" inputMode="numeric" value={f.ageDeclared} onChange={set('ageDeclared')} /></label>
        <label className="field">Altura (cm)<input className="input" inputMode="numeric" value={f.heightCm} onChange={set('heightCm')} /></label>
        <label className="field">Meta de peso (kg)<input className="input" inputMode="decimal" value={f.goalWeightKg} onChange={set('goalWeightKg')} /></label>
        <label className="field">Sesiones/semana<input className="input" inputMode="numeric" value={f.weeklySessionGoal} onChange={set('weeklySessionGoal')} /></label>
        <label className="field">Pesarme cada (días)<input className="input" inputMode="numeric" value={f.weighInEveryDays} onChange={set('weighInEveryDays')} /></label>
        <label className="field">Entreno temprano<input className="input" type="time" value={f.preferredTrainingTime} onChange={set('preferredTrainingTime')} /></label>
        <label className="field">Alternativa tarde<input className="input" type="time" value={f.fallbackTrainingTime} onChange={set('fallbackTrainingTime')} /></label>
        <label className="field">Empiezo a trabajar<input className="input" type="time" value={f.workStart} onChange={set('workStart')} /></label>
        <label className="field">Termino<input className="input" type="time" value={f.workEnd} onChange={set('workEnd')} /></label>
      </div>
      <label className="field">Meta de pasos entre semana <span className="hint">Vacío hasta tener una semana de datos reales.</span>
        <input className="input" inputMode="numeric" value={f.weekdayStepGoal} onChange={set('weekdayStepGoal')} placeholder="sin definir" />
      </label>
      <p className="small muted" style={{ margin: 0 }}>
        {profile.declaredWeightKg != null && <>Peso aproximado: ~{profile.declaredWeightKg} kg, no cuenta como medición. </>}
        Zona horaria: {profile.timezone}.
      </p>
      <label className="field">Antecedentes e indicaciones <span className="hint">Solo para tu referencia.</span>
        <textarea className="input" value={f.healthNotes} onChange={set('healthNotes')} />
      </label>
      <button className="btn" onClick={save} data-testid="profile-save">Guardar perfil</button>
    </section>
  )
}

function AccountCard() {
  const s = useSyncStatus()
  const cloud = isCloudConfigured()
  const label: Record<string, string> = { idle: 'sincronizado', syncing: 'sincronizando', offline: 'sin conexión', error: 'con datos sin subir', 'local-only': 'local', 'signed-out': 'sin cuenta', 'no-access': 'acceso pausado' }
  async function logout() {
    if (!confirm('Al cerrar sesión se borran los datos de este teléfono (quedan guardados en tu cuenta). ¿Seguimos?')) return
    try {
      await signOut()
      location.href = '/'
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (confirm(`${msg}\n\n¿Cerrar sesión igual y perder esos cambios?`)) {
        await signOut(true)
        location.href = '/'
      }
    }
  }
  return (
    <section className="card stack" id="cuenta">
      <h2>Cuenta y sincronización</h2>
      {!cloud ? (
        <p className="small muted" style={{ margin: 0 }}>Todo se guarda en este teléfono. Exportá respaldos seguido.</p>
      ) : s.state === 'signed-out' ? (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            El acceso es por invitación. Entrá con tu email para respaldar tus datos en tu cuenta privada; lo que ya cargaste en este teléfono se sube al entrar.
          </p>
          <Login />
        </>
      ) : (
        <>
          <p className="small" style={{ margin: 0 }}>
            <strong>{s.email}</strong>
            {s.membership && <span className="muted"> · {s.membership.role === 'admin' ? 'administrador' : 'miembro'}</span>}
          </p>
          <p className="small" style={{ margin: 0 }} data-testid="account-state">
            Estado: <strong>{label[s.state]}</strong>
            {s.pending > 0 && <> · {s.pending} cambios por subir</>}
            {s.lastSyncAt && <> · última sincronización {new Date(s.lastSyncAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</>}
          </p>
          {s.error && <p className="small danger" role="alert" style={{ margin: 0 }}>{s.error}</p>}
          <p className="tiny muted" style={{ margin: 0 }}>Se sincroniza con la app abierta y conexión; iOS no permite hacerlo en segundo plano.</p>
          <div className="row wrap">
            <button className="btn sm" onClick={() => requestSync()}>Sincronizar ahora</button>
            {s.membership?.role === 'admin' && <Link className="btn sm ghost" href="/datos/equipo/">Equipo y accesos</Link>}
            <button className="btn sm quiet" onClick={logout}>Cerrar sesión</button>
          </div>
        </>
      )}
    </section>
  )
}

function SecurityCard() {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [on, setOn] = useState(false)
  const s = useSyncStatus()
  useEffect(() => {
    lockSupported().then(setSupported)
    setOn(!!getLock())
  }, [])
  const loggedIn = s.email != null
  return (
    <section className="card stack" id="seguridad">
      <h2>Bloqueo con Face ID</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Pide tu cara (o el código del iPhone) al abrir la app y después de 5 minutos sin usarla. Es un bloqueo de pantalla: no cifra los datos.
      </p>
      {supported === false ? (
        <p className="small" style={{ margin: 0 }}><span className="badge neutral">No disponible en este navegador</span></p>
      ) : !loggedIn && !on ? (
        <p className="small muted" style={{ margin: 0 }}>Entrá con tu cuenta primero: si Face ID falla, vas a poder desbloquear con el código por email.</p>
      ) : (
        <label className="row between small" style={{ gap: 8 }}>
          <span><strong>{on ? 'Activado' : 'Desactivado'}</strong></span>
          <input type="checkbox" checked={on} style={{ width: 26, height: 26 }} onChange={async (e) => {
            if (e.target.checked) {
              try {
                await enableLock()
                setOn(true)
                showToast('Bloqueo activado')
              } catch (err) {
                showToast(`No se pudo activar: ${err instanceof Error ? err.message : err}`, true)
              }
            } else {
              disableLock()
              setOn(false)
              showToast('Bloqueo desactivado')
            }
          }} data-testid="lock-toggle" />
        </label>
      )}
    </section>
  )
}

function BackupCard() {
  const [est, setEst] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { storageEstimate().then(setEst) }, [])

  async function doExport(photos: boolean) {
    setBusy(true)
    try {
      const blob = await exportBackup(photos)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `lovely-fit-respaldo-${dayKey()}${photos ? '-con-fotos' : ''}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    } catch (e) {
      showToast(`No se pudo exportar: ${e instanceof Error ? e.message : e}`, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card stack" id="respaldo">
      <h2>Respaldo</h2>
      <p className="small muted" style={{ margin: 0 }}>
        El navegador puede borrar datos de sitios que no se usan (Safari lo hace tras semanas sin abrir la app si no está instalada). Exportá un respaldo cada tanto.
      </p>
      {est && (
        <p className="tiny muted" style={{ margin: 0 }}>
          Usado: {(est.usage / 1048576).toFixed(1)} MB · almacenamiento {est.persisted ? 'persistente' : 'no persistente'}
          {!est.persisted && <> · <button className="linkbtn tiny" onClick={async () => { const ok = await requestPersistence(); showToast(ok ? 'Almacenamiento persistente activado' : 'El navegador no lo concedió'); setEst(await storageEstimate()) }}>pedir persistencia</button></>}
        </p>
      )}
      <div className="row wrap">
        <button className="btn sm" disabled={busy} onClick={() => doExport(false)} data-testid="export">Exportar datos</button>
        <button className="btn sm ghost" disabled={busy} onClick={() => doExport(true)}>Exportar con fotos</button>
        <label className="btn sm quiet">
          Importar respaldo
          <input type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            const r = await persist(async () => importBackup(await f.text()))
            if (r.ok) showToast(`Importado: ${r.value.inserted} nuevos, ${r.value.updated} actualizados, ${r.value.skipped} sin cambios`)
          }} />
        </label>
      </div>
    </section>
  )
}

function RemindersCard() {
  const reminders = useRows<Reminder>('reminders')
  return (
    <section className="card stack" id="recordatorios">
      <h2>Recordatorios</h2>
      <div className="card soft small">
        <strong>Estado: todavía no se envían.</strong> Guardamos tu configuración, pero para avisos con la app cerrada en iPhone hace falta
        la app instalada (iOS 16.4+), tu permiso y un envío desde servidor. Eso está pendiente de verificar con planes gratuitos.
        No simulamos avisos con temporizadores de página.
      </div>
      {(reminders ?? []).map((r) => <ReminderRow key={r.id} r={r} />)}
    </section>
  )
}

function ReminderRow({ r }: { r: Reminder }) {
  const toggleDay = (d: number) => {
    const weekdays = r.weekdays.includes(d) ? r.weekdays.filter((x) => x !== d) : [...r.weekdays, d].sort()
    persist(() => update<Reminder>('reminders', r.id, { weekdays }))
  }
  return (
    <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--stone)', paddingTop: 12 }}>
      <div className="row between">
        <div className="grow">
          <div style={{ fontWeight: 600 }}>{r.label}</div>
          <div className="small muted">{r.message}</div>
        </div>
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={r.enabled} onChange={(e) => persist(() => update<Reminder>('reminders', r.id, { enabled: e.target.checked }))} style={{ width: 22, height: 22 }} />
          {r.enabled ? 'Activado' : 'Apagado'}
        </label>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        <input className="input" type="time" value={r.time} style={{ width: 120, minHeight: 40 }} aria-label="Hora"
          onChange={(e) => persist(() => update<Reminder>('reminders', r.id, { time: e.target.value }))} />
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <button key={d} className="chip" style={{ minWidth: 40, justifyContent: 'center' }} aria-pressed={r.weekdays.includes(d)} onClick={() => toggleDay(d)}>{weekdayShort(d)[0]}</button>
        ))}
      </div>
      {r.kind === 'gym' && <p className="tiny muted" style={{ margin: 0 }}>Regla prevista: solo en día programado y si todavía no registraste entrenamiento.</p>}
    </div>
  )
}

function IntegrationsCard() {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return (
    <section className="card stack" id="integraciones">
      <h2>Integraciones</h2>
      <Integration name="GloryFitPro (reloj DM58)" status="Pendiente de prueba" cls="warn">
        Registra tus salidas. Falta hacer una salida de prueba y ver si permite exportar el recorrido (GPX u otro). Mientras, cargá a mano o importá un GPX si lo conseguís.
      </Integration>
      <Integration name="Salud + Atajos (iPhone)" status="Experimental · sin probar" cls="warn">
        Un Atajo puede abrir <code className="tiny">{origin}/importar/?date=AAAA-MM-DD&steps=N</code> con los datos del día.
        Lovely Fit pide confirmación y no duplica (fecha + tipo + fuente). Puede fallar con el teléfono bloqueado. Guía en docs/INTEGRACIONES.md.
      </Integration>
      <Integration name="Notificaciones" status="No activas" cls="neutral">Ver Recordatorios.</Integration>
      <Integration name="Strava / adidas Running" status="Fuera del MVP" cls="neutral">No son dependencias. Strava pedía suscripción para su API; habría que volver a verificar.</Integration>
    </section>
  )
}

function Integration({ name, status, cls, children }: { name: string; status: string; cls: string; children: React.ReactNode }) {
  return (
    <div className="stack" style={{ gap: 4, borderTop: '1px solid var(--stone)', paddingTop: 12 }}>
      <div className="row between"><strong>{name}</strong><span className={`badge ${cls}`}>{status}</span></div>
      <p className="small muted" style={{ margin: 0 }}>{children}</p>
    </div>
  )
}

function InstallCard() {
  const [standalone, setStandalone] = useState(false)
  useEffect(() => {
    setStandalone(window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
  }, [])
  return (
    <section className="card stack" id="instalar">
      <h2>Instalar en el iPhone</h2>
      {standalone ? <p className="small" style={{ margin: 0 }}><span className="badge ok">Instalada</span></p> : (
        <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Abrí esta página en <strong>Safari</strong>.</li>
          <li>Tocá Compartir (cuadrado con flecha).</li>
          <li>Elegí <strong>Agregar a inicio</strong>.</li>
          <li>Abrí Lovely Fit desde el ícono. Ojo: la app instalada y Safari guardan datos por separado.</li>
        </ol>
      )}
    </section>
  )
}

function DangerCard() {
  return (
    <section className="card stack">
      <h2>Borrar datos</h2>
      <p className="small muted" style={{ margin: 0 }}>Borra todo lo guardado en este dispositivo. No borra lo que esté en la nube.</p>
      <button className="btn danger sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
        const pending = await countPending()
        const warn = pending > 0 ? `\n\nHay ${pending} cambios que NO están en la nube: se perderían.` : ''
        if (!confirm(`¿Borrar TODOS los datos de este dispositivo? Exportá un respaldo antes.${warn}`)) return
        if (prompt('Escribí BORRAR para confirmar') !== 'BORRAR') return
        await wipeLocal()
        location.href = '/'
      }}>Borrar datos de este dispositivo</button>
    </section>
  )
}
