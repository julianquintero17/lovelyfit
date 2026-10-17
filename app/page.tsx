'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { getDB, insert, update } from '@/lib/db'
import { fmtDay, relativeDay, weekDays, weekday, weekdayShort } from '@/lib/dates'
import { useProfile, useRows, useSyncStatus, useToday } from '@/lib/hooks'
import { dailyValue, doneSessions, latest, nextWeighIn } from '@/lib/stats'
import { activeSession, startSession } from '@/lib/training'
import { seedFor } from '@/lib/seed'
import type { DailyMetric, Habit, HabitLog, Measurement, Plan, PlanDay, Session } from '@/lib/types'
import { ActivityForm, MeasurementForm, StepsForm } from '@/components/Forms'
import { IconMinus, IconPlus } from '@/components/Icons'
import { Ring, Sheet, persist } from '@/components/ui'

export default function TodayPage() {
  const { profile } = useProfile()
  const today = useToday(profile?.timezone)
  const router = useRouter()
  const sessions = useRows<Session>('sessions')
  const plans = useRows<Plan>('plans')
  const days = useRows<PlanDay>('planDays')
  const measurements = useRows<Measurement>('measurements')
  const metrics = useRows<DailyMetric>('dailyMetrics')
  const habits = useRows<Habit>('habits')
  const habitLogs = useLiveQuery(() => getDB().habitLogs.where('date').equals(today).toArray(), [today])
  const current = useLiveQuery(() => activeSession(), [])
  const sync = useSyncStatus()
  const [sheet, setSheet] = useState<null | 'weight' | 'waist' | 'cardio' | 'steps'>(null)

  if (profile === undefined || sessions === undefined) return <p className="empty">Cargando…</p>
  if (profile === null) {
    return (
      <div className="card stack">
        <h2>Todavía no hay datos en este dispositivo</h2>
        <p className="small muted">Si entraste con tu cuenta, puede que la sincronización siga en curso.</p>
        <button className="btn" onClick={() => persist(() => seedFor(), 'Perfil creado')}>Crear perfil y rutina inicial</button>
      </div>
    )
  }

  const plan = plans?.find((p) => p.active)
  const planDays = (days ?? []).filter((d) => d.planId === plan?.id).sort((a, b) => a.order - b.order)
  const wd = weekday(today)
  const todayDay = planDays.find((d) => d.weekday === wd)
  const done = doneSessions(sessions)
  const doneToday = done.filter((s) => s.date === today)
  const week = weekDays(today)
  const weekDone = done.filter((s) => s.date >= week[0] && s.date <= week[6])
  const goal = profile.weeklySessionGoal
  // Siguiente día del plan no hecho esta semana (para días sin asignar)
  const doneDayIds = new Set(weekDone.map((s) => s.planDayId))
  const nextDay = todayDay ?? planDays.find((d) => !doneDayIds.has(d.id))

  const steps = metrics ? dailyValue(metrics, 'steps', today) : null
  const lastStep = metrics?.filter((m) => m.kind === 'steps').sort((a, b) => b.date.localeCompare(a.date))[0]
  const weigh = nextWeighIn(measurements ?? [], profile.weighInEveryDays, today)
  const lastWeight = latest(measurements ?? [], 'weight')
  const hour = Number(new Intl.DateTimeFormat('es-AR', { hour: 'numeric', hour12: false, timeZone: profile.timezone }).format(new Date()))
  const greet = hour < 12 ? 'Buen día' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'

  async function begin(day: PlanDay | null) {
    const r = await persist(() => startSession(day, profile!.timezone))
    if (r.ok) router.push(`/entrenar/sesion/?id=${r.value.id}`)
  }

  return (
    <div className="stack-lg">
      <div>
        <p className="kicker">{fmtDay(today)}</p>
        <h1 style={{ marginTop: 4 }}>{greet}, {profile.displayName}</h1>
      </div>

      {/* Entrenamiento de hoy */}
      {current ? (
        <div className="card brand hero stack">
          <p className="kicker">{current.date === today ? 'Sesión en curso' : `Sesión sin terminar · ${fmtDay(current.date)}`}</p>
          <h2 style={{ fontSize: 28 }}>{current.name}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {current.date === today ? 'Quedó guardada. Podés seguir donde la dejaste.' : 'Quedó abierta de otro día. Entrá para terminarla o descartarla y empezar la de hoy.'}
          </p>
          <Link className="btn light block" href={`/entrenar/sesion/?id=${current.id}`} data-testid="resume-session">Continuar sesión</Link>
        </div>
      ) : doneToday.length ? (
        <div className="card brand hero stack">
          <p className="kicker">Hoy</p>
          <h2 style={{ fontSize: 28 }}>Entrenaste: {doneToday.map((s) => s.name).join(' + ')}</h2>
          <p className="ed" style={{ margin: 0, fontSize: 18 }}>Bien ahí. Ahora a recuperar.</p>
        </div>
      ) : nextDay ? (
        <div className="card brand hero stack">
          <p className="kicker">{todayDay ? 'Hoy toca' : 'Día libre · si querés entrenar'}</p>
          <h2 style={{ fontSize: 30 }}>{nextDay.name}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {nextDay.items.length} ejercicios · ~{profile.preferredTrainingTime} o por la tarde
          </p>
          <button className="btn light block" onClick={() => begin(nextDay)} data-testid="start-today">Empezar {nextDay.name.split('·')[0].trim()}</button>
          <Link href="/entrenar/" className="small" style={{ color: 'var(--cream)' }}>Elegir otro día</Link>
        </div>
      ) : (
        <div className="card stack">
          <h2>Sin plan activo</h2>
          <Link className="btn" href="/entrenar/plan/">Armar plan</Link>
        </div>
      )}

      <Tips />

      {/* Meta semanal */}
      <div className="card">
        <div className="row" style={{ gap: 16 }}>
          <Ring value={weekDone.length} max={goal}>
            <div>
              <div className="num" style={{ fontSize: 28 }} data-testid="week-count">{weekDone.length}<span className="muted" style={{ fontSize: 18 }}>/{goal}</span></div>
            </div>
          </Ring>
          <div className="grow stack" style={{ gap: 6 }}>
            <p className="kicker" style={{ margin: 0 }}>Meta semanal</p>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {weekDone.length >= goal ? '¡Semana cumplida!' : weekDone.length === 0 ? 'Semana nueva, arrancamos.' : `Vas ${weekDone.length} de ${goal}.`}
            </p>
            <p className="small muted" style={{ margin: 0 }}>No hace falta recuperar sesiones: cada semana empieza de cero.</p>
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
          {week.map((d) => {
            const n = done.filter((s) => s.date === d).length
            const planned = planDays.some((p) => p.weekday === weekday(d))
            return (
              <div key={d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span className="tiny" style={{ fontWeight: d === today ? 700 : 500, color: d === today ? 'var(--clay-ink)' : 'var(--ink-2)' }}>{weekdayShort(weekday(d))}</span>
                <span aria-label={n ? 'entrenado' : planned ? 'planificado' : 'libre'} style={{
                  width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  background: n ? 'var(--lab)' : 'transparent', border: n ? 0 : planned ? '1.5px solid var(--olive)' : '1.5px dashed var(--stone)',
                  color: 'var(--cream)', fontSize: 13, fontWeight: 700,
                }}>{n ? '✓' : ''}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Accesos rápidos */}
      <div>
        <p className="kicker" style={{ marginBottom: 8 }}>Registrar</p>
        <div className="grid2">
          <Link className="btn quiet" href="/comidas/?nueva=1">Comida</Link>
          <button className="btn quiet" onClick={() => setSheet('cardio')}>Caminata / bici</button>
          <button className="btn quiet" onClick={() => setSheet('weight')} data-testid="quick-weight">Peso</button>
          <button className="btn quiet" onClick={() => setSheet('steps')}>Pasos</button>
        </div>
      </div>

      {/* Movimiento */}
      <div className="card stack">
        <div className="card-title" style={{ margin: 0 }}>
          <h3>Movimiento</h3>
          <button className="linkbtn small" onClick={() => setSheet('steps')}>Cargar pasos</button>
        </div>
        <div className="grid2">
          <div className="metric">
            <span className="value">{steps == null ? '—' : steps.toLocaleString('es-AR')}</span>
            <span className="label">{steps == null ? 'pasos hoy · sin datos' : 'pasos hoy'}</span>
          </div>
          <div className="metric">
            <span className="value small" style={{ fontSize: 16 }}>{lastStep ? relativeDay(lastStep.date, today) : 'nunca'}</span>
            <span className="label">último dato de pasos{lastStep ? ` (${lastStep.source === 'shortcut' ? 'Atajos' : 'manual'})` : ''}</span>
          </div>
        </div>
        {(habits ?? []).filter((h) => h.active).map((h) => (
          <HabitRow key={h.id} habit={h} today={today} log={habitLogs?.filter((l) => l.habitId === h.id && !l.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]} />
        ))}
      </div>

      {/* Pesaje */}
      <div className="card row between">
        <div className="stack" style={{ gap: 2 }}>
          <p className="kicker" style={{ margin: 0 }}>Pesaje cada {profile.weighInEveryDays} días</p>
          {lastWeight ? (
            <p style={{ margin: 0 }}>
              Último: <strong className="num">{String(lastWeight.value).replace('.', ',')} kg</strong> <span className="muted small">({relativeDay(lastWeight.date, today)})</span>
              {weigh.due && <span className="small muted"> · {weigh.overdue ? 'ya toca' : `próximo ${fmtDay(weigh.due)}`}</span>}
            </p>
          ) : (
            <p className="small" style={{ margin: 0 }}>Falta tu primer pesaje con fecha.{profile.declaredWeightKg != null && ` Por ahora solo está el aproximado (~${profile.declaredWeightKg} kg).`}</p>
          )}
        </div>
        <button className="btn sm ghost" onClick={() => setSheet('weight')}>Pesarme</button>
      </div>

      <p className="tiny muted" style={{ textAlign: 'center' }}>
        {sync.state === 'local-only' || sync.state === 'signed-out'
          ? 'Datos guardados solo en este teléfono. Hacé un respaldo seguido desde Ajustes.'
          : sync.state === 'error' || sync.state === 'no-access'
            ? sync.error
            : sync.pending > 0
              ? `${sync.pending} cambios guardados en el teléfono, todavía sin subir.`
              : sync.lastSyncAt
                ? `Todo respaldado · ${new Date(sync.lastSyncAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`
                : 'Todavía no se sincronizó.'}
      </p>

      <Sheet open={sheet === 'weight'} onClose={() => setSheet(null)} title="Peso">
        <MeasurementForm kind="weight" onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === 'cardio'} onClose={() => setSheet(null)} title="Caminata, bici o carrera">
        <ActivityForm onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === 'steps'} onClose={() => setSheet(null)} title="Pasos del día">
        <StepsForm onDone={() => setSheet(null)} />
      </Sheet>
    </div>
  )
}

function HabitRow({ habit, today, log }: { habit: Habit; today: string; log?: HabitLog }) {
  const count = log?.count ?? 0
  const set = (n: number) =>
    persist(async () => {
      if (log) await update<HabitLog>('habitLogs', log.id, { count: Math.max(0, n) })
      else await insert<HabitLog>('habitLogs', { habitId: habit.id, date: today, count: Math.max(0, n) })
    })
  return (
    <div className="row between" style={{ borderTop: '1px solid var(--stone)', paddingTop: 12 }}>
      <div>
        <p style={{ margin: 0, fontWeight: 600 }}>{habit.name}</p>
        <p className="small muted" style={{ margin: 0 }}>{count} de {habit.targetPerDay} hoy{count >= habit.targetPerDay ? ' · ¡listo!' : ''}</p>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className="iconbtn" aria-label="Restar" onClick={() => set(count - 1)} disabled={count === 0}><IconMinus /></button>
        <button className="iconbtn" aria-label="Sumar pausa" onClick={() => set(count + 1)}><IconPlus /></button>
      </div>
    </div>
  )
}

/** Guía corta para los primeros días. Se puede cerrar y no vuelve. */
function Tips() {
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    try { setHidden(localStorage.getItem('lf-tips-done') === '1') } catch { setHidden(false) }
  }, [])
  if (hidden) return null
  const close = () => {
    try { localStorage.setItem('lf-tips-done', '1') } catch { /* sin storage */ }
    setHidden(true)
  }
  return (
    <div className="card soft stack" style={{ gap: 8 }}>
      <div className="row between"><p className="kicker" style={{ margin: 0 }}>Cómo usar Lovely Fit</p><button className="linkbtn small" onClick={close}>Entendido</button></div>
      <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
        <li><strong>Entrená:</strong> tocá Empezar, escribí los kilos y marcá ✓ en cada serie. Se guarda sola.</li>
        <li><strong>Comé normal:</strong> en Comidas elegí una habitual y el tamaño. Las calorías son opcionales.</li>
        <li><strong>Medite cada 2 semanas:</strong> peso y cintura, en las mismas condiciones.</li>
        <li><strong>Mirá Progreso</strong> el domingo: la semana, tus cargas y tus logros.</li>
      </ol>
    </div>
  )
}
