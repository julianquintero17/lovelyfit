'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { softDelete } from '@/lib/db'
import { dayKey, fmtDay, isValidDayKey, weekdayLong, weekDays } from '@/lib/dates'
import { useProfile, useRows, useToday } from '@/lib/hooks'
import { doneSessions } from '@/lib/stats'
import { activeSession, sessionMinutes, startSession, type PastSession } from '@/lib/training'
import type { Activity, Plan, PlanDay, Session } from '@/lib/types'
import { ActivityForm } from '@/components/Forms'
import { RouteMap } from '@/components/RouteMap'
import { Sheet, persist } from '@/components/ui'

export default function TrainPage() {
  const router = useRouter()
  const { profile } = useProfile()
  const today = useToday(profile?.timezone)
  const plans = useRows<Plan>('plans')
  const days = useRows<PlanDay>('planDays')
  const sessions = useRows<Session>('sessions')
  const activities = useRows<Activity>('activities')
  const current = useLiveQuery(() => activeSession(), [])
  const [sheet, setSheet] = useState<null | 'cardio' | 'past'>(null)
  const [openAct, setOpenAct] = useState<Activity | null>(null)
  const [editAct, setEditAct] = useState(false)

  const plan = plans?.find((p) => p.active)
  const planDays = (days ?? []).filter((d) => d.planId === plan?.id).sort((a, b) => a.order - b.order)
  const week = weekDays(today)
  const doneWeek = doneSessions(sessions ?? []).filter((s) => s.date >= week[0] && s.date <= week[6])
  const history = doneSessions(sessions ?? []).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 12)
  const acts = (activities ?? []).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 10)

  async function begin(day: PlanDay | null) {
    if (current) {
      router.push(`/entrenar/sesion/?id=${current.id}`)
      return
    }
    const r = await persist(() => startSession(day, profile?.timezone))
    if (r.ok) router.push(`/entrenar/sesion/?id=${r.value.id}`)
  }

  return (
    <div className="stack-lg">
      <div className="row between">
        <h1>Entrenar</h1>
        <Link href="/entrenar/plan/" className="btn sm ghost">Editar plan</Link>
      </div>

      {current ? (
        <Link href={`/entrenar/sesion/?id=${current.id}`} className="card brand stack" style={{ textDecoration: 'none', display: 'flex', gap: 4 }}>
          <p className="kicker">Sesión en curso</p>
          <h2>{current.name} · continuar →</h2>
        </Link>
      ) : (
        <div className="modes">
          <button className="mode primary" onClick={() => document.getElementById('plan-days')?.scrollIntoView({ behavior: 'smooth' })}>
            <span className="title">Con rutina</span>
            <span className="small" style={{ opacity: 0.85 }}>Seguí un día de tu plan</span>
          </button>
          <button className="mode" onClick={() => begin(null)} data-testid="start-free">
            <span className="title">Libre</span>
            <span className="small muted">Elegí ejercicios a medida que los hacés</span>
          </button>
        </div>
      )}
      <button className="linkbtn small" style={{ alignSelf: 'flex-start' }} onClick={() => setSheet('past')} data-testid="past-session">
        + Cargar una sesión que ya hiciste
      </button>

      <section className="stack" id="plan-days">
        <div className="row between">
          <h2>{plan?.name ?? 'Sin plan activo'}</h2>
        </div>
        {plan?.notes && <p className="small muted" style={{ margin: 0 }}>{plan.notes}</p>}
        {planDays.map((d) => {
          const doneThisWeek = doneWeek.some((s) => s.planDayId === d.id)
          return (
            <div key={d.id} className="card">
              <div className="row between">
                <div>
                  <h3>{d.name}</h3>
                  <p className="small muted" style={{ margin: 0 }}>
                    {d.weekday != null ? weekdayLong(d.weekday) : 'flexible'} · {d.items.length} ejercicios
                    {doneThisWeek && <span className="accent"> · hecho esta semana</span>}
                  </p>
                </div>
                <button className="btn sm" onClick={() => begin(d)} disabled={!!current} data-testid={`start-${d.order}`}>
                  Empezar
                </button>
              </div>
            </div>
          )
        })}
        {current && <p className="tiny muted" style={{ margin: 0 }}>Terminá o descartá la sesión en curso antes de empezar otra.</p>}
      </section>

      <section className="stack">
        <div className="row between">
          <h2>Caminar, bici, correr</h2>
          <button className="btn sm ghost" onClick={() => setSheet('cardio')} data-testid="add-cardio">Registrar</button>
        </div>
        <div className="card">
          <p className="small muted" style={{ marginTop: 0 }}>
            Las salidas se registran con el reloj en GloryFitPro. Importación automática: <strong>pendiente de prueba</strong>. Mientras, cargalas a mano o importá un GPX.
          </p>
          {acts.length === 0 ? (
            <p className="empty small">Todavía no registraste actividades.</p>
          ) : (
            <div className="list">
              {acts.map((a) => (
                <button key={a.id} className="item" style={{ background: 'none', border: 0, textAlign: 'left', width: '100%', cursor: 'pointer' }} onClick={() => { setOpenAct(a); setEditAct(false) }}>
                  <div className="grow">
                    <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{a.type}{a.route ? ' · con recorrido' : ''}</div>
                    <div className="small muted">{fmtDay(a.date)} · {a.durationMin ?? '—'} min{a.distanceKm != null ? ` · ${String(a.distanceKm).replace('.', ',')} km` : ''}</div>
                  </div>
                  <span className="tiny muted">{a.source === 'manual' ? 'manual' : a.source.toUpperCase()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="stack">
        <div className="row between">
          <h2>Historial</h2>
          <Link href="/entrenar/ejercicios/" className="small">Ejercicios</Link>
        </div>
        <div className="card">
          {history.length === 0 ? (
            <p className="empty small">Tu primera sesión va a aparecer acá.</p>
          ) : (
            <div className="list">
              {history.map((s) => (
                <Link key={s.id} href={`/entrenar/sesion/?id=${s.id}`} className="item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div className="small muted">{fmtDay(s.date)}{sessionMinutes(s) ? ` · ${sessionMinutes(s)} min` : ''}</div>
                  </div>
                  <span aria-hidden>›</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <Sheet open={sheet === 'past'} onClose={() => setSheet(null)} title="Cargar sesión hecha">
        <PastSessionForm days={planDays} onCreate={async (day, past) => {
          const r = await persist(() => startSession(day, profile?.timezone, past), 'Sesión creada: cargá tus series')
          if (r.ok) router.push(`/entrenar/sesion/?id=${r.value.id}`)
        }} />
      </Sheet>
      <Sheet open={sheet === 'cardio'} onClose={() => setSheet(null)} title="Caminata, bici o carrera">
        <ActivityForm onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={!!openAct} onClose={() => setOpenAct(null)} title={openAct ? `${openAct.type[0].toUpperCase()}${openAct.type.slice(1)} · ${fmtDay(openAct.date)}` : ''}>
        {openAct && (editAct ? (
          <ActivityForm existing={openAct} onDone={() => setOpenAct(null)} />
        ) : (
          <div className="stack">
            <div className="grid3">
              <div className="metric"><span className="value">{openAct.durationMin ?? '—'}</span><span className="label">min</span></div>
              <div className="metric"><span className="value">{openAct.distanceKm != null ? String(openAct.distanceKm).replace('.', ',') : '—'}</span><span className="label">km</span></div>
              <div className="metric"><span className="value">{openAct.avgHr ?? '—'}</span><span className="label">FC media</span></div>
            </div>
            {openAct.route ? <RouteMap route={openAct.route} /> : <p className="small muted">Sin recorrido: solo se muestra mapa cuando hay coordenadas reales importadas.</p>}
            {openAct.notes && <p className="small">{openAct.notes}</p>}
            <div className="row">
              <button className="btn quiet sm" onClick={() => setEditAct(true)}>Editar</button>
              <button className="btn danger sm" onClick={async () => {
                if (!confirm('¿Borrar esta actividad?')) return
                const r = await persist(() => softDelete('activities', openAct.id), 'Actividad borrada')
                if (r.ok) setOpenAct(null)
              }}>Borrar</button>
            </div>
          </div>
        ))}
      </Sheet>
    </div>
  )
}

function PastSessionForm({ days, onCreate }: { days: PlanDay[]; onCreate: (day: PlanDay | null, past: PastSession) => void }) {
  const [date, setDate] = useState(dayKey())
  const [time, setTime] = useState('07:00')
  const [minutes, setMinutes] = useState('60')
  const [dayId, setDayId] = useState<string>('')
  const m = Number(minutes)
  const valid = isValidDayKey(date) && date <= dayKey() && /^\d{2}:\d{2}$/.test(time) && m > 0 && m <= 300
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>Para pasar lo que anotaste en el gimnasio. Después cargás ejercicios y series como siempre.</p>
      <div className="grid2">
        <label className="field">Día<input className="input" type="date" value={date} max={dayKey()} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field">Hora de inicio<input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <label className="field">Duración (min)<input className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
      <label className="field">
        ¿Qué hiciste?
        <select className="input" value={dayId} onChange={(e) => setDayId(e.target.value)}>
          <option value="">Libre (elijo los ejercicios)</option>
          {days.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <button className="btn block" disabled={!valid} data-testid="past-create" onClick={() => {
        // Hora local de Buenos Aires (UTC−3, sin horario de verano)
        const startedAt = new Date(`${date}T${time}:00-03:00`).toISOString()
        onCreate(days.find((d) => d.id === dayId) ?? null, { startedAt, minutes: m })
      }}>Crear y cargar series</button>
    </div>
  )
}
