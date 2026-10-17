'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { getDB, softDelete } from '@/lib/db'
import { addDays, fmtDay, fmtMonth, fmtShort, monthStart, weekDays, weekStart, weekday, weekdayShort } from '@/lib/dates'
import { useProfile, useRows, useToday } from '@/lib/hooks'
import {
  achievements, dailyValue, latest, monthPeriod, series, stepStats, suggestWeekdayStepGoal, summarize, weekPeriod, type Period,
} from '@/lib/stats'
import { describeSets, recentPerformances } from '@/lib/training'
import type { Activity, DailyMetric, Exercise, Measurement, Photo, Session } from '@/lib/types'
import { MeasurementForm, StepsForm } from '@/components/Forms'
import { PhotoButton, PhotoImg } from '@/components/Photo'
import { LineChart, Sheet, WeekBars, persist } from '@/components/ui'
import { update } from '@/lib/db'
import type { Profile } from '@/lib/types'

export default function ProgressPage() {
  const { profile } = useProfile()
  const today = useToday(profile?.timezone)
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(today)
  const sessions = useRows<Session>('sessions')
  const activities = useRows<Activity>('activities')
  const measurements = useRows<Measurement>('measurements')
  const metrics = useRows<DailyMetric>('dailyMetrics')
  const photos = useRows<Photo>('photos')
  const exercises = useRows<Exercise>('exercises')
  const [sheet, setSheet] = useState<null | 'weight' | 'waist' | 'steps' | 'photos'>(null)
  const [exId, setExId] = useState<string>('')

  const period: Period = mode === 'week' ? weekPeriod(anchor) : monthPeriod(anchor)
  const prevPeriod: Period = mode === 'week' ? weekPeriod(addDays(period.from, -1)) : monthPeriod(addDays(period.from, -1))
  const sum = summarize(period, sessions ?? [], activities ?? [])
  const prev = summarize(prevPeriod, sessions ?? [], activities ?? [])
  const goal = profile?.weeklySessionGoal ?? 4
  const st = stepStats(metrics ?? [], period)
  const weightSeries = series(measurements ?? [], 'weight')
  const waistSeries = series(measurements ?? [], 'waist')
  const lastW = latest(measurements ?? [], 'weight')
  const firstW = weightSeries[0]
  const ach = achievements({ sessions: sessions ?? [], activities: activities ?? [], measurements: measurements ?? [], goal })
  const stepGoalSuggestion = suggestWeekdayStepGoal(metrics ?? [], today)
  const progressPhotos = (photos ?? []).filter((p) => p.kind === 'progress').sort((a, b) => b.date.localeCompare(a.date))

  // Ejercicios con registros, para el selector de cargas
  const loggedIds = useLiveQuery(async () => {
    const s = await getDB().sets.toArray()
    return [...new Set(s.filter((x) => x.done && !x.deletedAt).map((x) => x.exerciseId))]
  }, [])
  const logged = (exercises ?? []).filter((e) => loggedIds?.includes(e.id))
  const selected = exId || logged[0]?.id || ''
  const perfs = useLiveQuery(() => (selected ? recentPerformances(selected, undefined, 20) : Promise.resolve([])), [selected, sessions])

  const isCurrent = mode === 'week' ? weekStart(anchor) === weekStart(today) : monthStart(anchor) === monthStart(today)
  const shift = (dir: -1 | 1) => setAnchor(mode === 'week' ? addDays(anchor, 7 * dir) : addDays(dir === -1 ? addDays(period.from, -1) : addDays(period.to, 1), 0))

  const stepBars = useMemo(() => weekDays(mode === 'week' ? anchor : today).map((d) => ({
    label: weekdayShort(weekday(d)).slice(0, 2), value: dailyValue(metrics ?? [], 'steps', d), today: d === today,
  })), [metrics, anchor, mode, today])

  const delta = (a: number, b: number) => (a === b ? '=' : a > b ? `+${a - b}` : `${a - b}`)

  return (
    <div className="stack-lg">
      <h1>Progreso</h1>
      <div className="seg" role="group" aria-label="Período">
        <button aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Semana</button>
        <button aria-pressed={mode === 'month'} onClick={() => setMode('month')}>Mes</button>
      </div>
      <div className="row between">
        <button className="iconbtn" aria-label="Anterior" onClick={() => shift(-1)}>‹</button>
        <strong>{mode === 'week' ? `${fmtShort(period.from)} – ${fmtShort(period.to)}` : fmtMonth(period.from)}</strong>
        <button className="iconbtn" aria-label="Siguiente" onClick={() => shift(1)} disabled={isCurrent}>›</button>
      </div>

      <div className="card brand">
        <div className="grid3">
          <div className="metric">
            <span className="value" data-testid="period-sessions">{sum.sessions}{mode === 'week' && <span style={{ fontSize: 18, opacity: .8 }}>/{goal}</span>}</span>
            <span className="label">sesiones</span>
          </div>
          <div className="metric"><span className="value">{sum.strengthMinutes + sum.cardioMinutes}</span><span className="label">min activos</span></div>
          <div className="metric"><span className="value">{sum.cardioKm != null ? String(sum.cardioKm).replace('.', ',') : '—'}</span><span className="label">km cardio</span></div>
        </div>
        <p className="small muted" style={{ margin: '10px 0 0' }}>
          {isCurrent
            ? `${mode === 'week' ? 'Semana' : 'Mes'} en curso: comparamos cuando termine.`
            : `vs. ${mode === 'week' ? 'semana' : 'mes'} anterior: ${delta(sum.sessions, prev.sessions)} sesiones · ${delta(sum.strengthMinutes + sum.cardioMinutes, prev.strengthMinutes + prev.cardioMinutes)} min`}
        </p>
      </div>

      {/* Peso y cintura */}
      <section className="card stack">
        <div className="card-title" style={{ margin: 0 }}>
          <h3>Peso</h3>
          <button className="btn sm ghost" onClick={() => setSheet('weight')}>+ Peso</button>
        </div>
        {lastW ? (
          <p style={{ margin: 0 }}>
            <span className="num" style={{ fontSize: 28 }}>{String(lastW.value).replace('.', ',')} kg</span>
            <span className="small muted"> · {fmtDay(lastW.date)}</span>
            {firstW && firstW.date !== lastW.date && <span className="small muted"> · {(lastW.value - firstW.value > 0 ? '+' : '') + (lastW.value - firstW.value).toFixed(1).replace('.', ',')} kg desde {fmtShort(firstW.date)}</span>}
            {profile?.goalWeightKg && <span className="small muted"> · meta {profile.goalWeightKg} kg</span>}
          </p>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>Sin pesajes con fecha.{profile?.declaredWeightKg != null && ` El aproximado (~${profile.declaredWeightKg} kg) no se grafica porque no tiene fecha.`}</p>
        )}
        <LineChart points={weightSeries.map((p) => ({ x: fmtShort(p.date), y: p.value }))} unit="kg" label="Evolución del peso" />
        <hr className="divider" />
        <div className="card-title" style={{ margin: 0 }}>
          <h3>Cintura</h3>
          <button className="btn sm ghost" onClick={() => setSheet('waist')}>+ Cintura</button>
        </div>
        <LineChart points={waistSeries.map((p) => ({ x: fmtShort(p.date), y: p.value }))} unit="cm" label="Evolución de cintura" height={110} />
        <MeasurementList measurements={measurements ?? []} />
      </section>

      {/* Cargas */}
      <section className="card stack">
        <h3>Evolución de cargas</h3>
        {logged.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>Aparece cuando completes series.</p>
        ) : (
          <>
            <select className="input" value={selected} onChange={(e) => setExId(e.target.value)} aria-label="Ejercicio">
              {logged.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <LineChart points={(perfs ?? []).slice().reverse().flatMap((p) => {
              // Sin kilos cargados (peso corporal) no hay punto: 0 kg no es un dato real
              const kg = p.sets.map((s) => s.weightKg).filter((w): w is number => w != null && w > 0)
              return kg.length ? [{ x: fmtShort(p.session.date), y: Math.max(...kg) }] : []
            })} unit="kg" label="Carga máxima por sesión" />
            {perfs?.[0] && <p className="small muted" style={{ margin: 0 }}>Última: {describeSets(perfs[0].sets)}</p>}
          </>
        )}
      </section>

      {/* Pasos */}
      <section className="card stack">
        <div className="card-title" style={{ margin: 0 }}>
          <h3>Pasos</h3>
          <button className="btn sm ghost" onClick={() => setSheet('steps')}>+ Pasos</button>
        </div>
        <WeekBars days={stepBars} label="Pasos por día de la semana" />
        <p className="small" style={{ margin: 0 }}>
          {st.daysWithData === 0 ? <span className="muted">Sin datos de pasos en este período.</span> : <>Promedio <strong>{st.avg?.toLocaleString('es-AR')}</strong> en {st.daysWithData} día{st.daysWithData === 1 ? '' : 's'} con datos.</>}
        </p>
        {profile?.weekdayStepGoal ? (
          <p className="small muted" style={{ margin: 0 }}>Meta entre semana: {profile.weekdayStepGoal.toLocaleString('es-AR')} pasos.</p>
        ) : stepGoalSuggestion ? (
          <div className="card soft row between">
            <span className="small">Con tus datos reales, una meta entre semana razonable sería <strong>{stepGoalSuggestion.toLocaleString('es-AR')}</strong>.</span>
            <button className="btn sm" onClick={() => profile && persist(() => update<Profile>('profiles', profile.id, { weekdayStepGoal: stepGoalSuggestion }), 'Meta guardada')}>Usar</button>
          </div>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>Cargá al menos 5 días hábiles completos para proponer una meta entre semana (no usamos 10.000 por defecto).</p>
        )}
      </section>

      {/* Fotos */}
      <section className="card stack">
        <div className="card-title" style={{ margin: 0 }}>
          <h3>Fotos de progreso</h3>
          <PhotoButton kind="progress" label="Agregar" onSaved={() => undefined} />
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>Privadas. Se guardan en el teléfono{''} y, si activás la nube, en un espacio solo tuyo. No se analizan.</p>
        {progressPhotos.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Todavía no hay fotos.</p> : (
          <div className="gallery">
            {progressPhotos.slice(0, 9).map((p) => (
              <figure key={p.id} style={{ margin: 0 }}>
                <PhotoImg id={p.id} alt={`Foto de progreso ${fmtDay(p.date)}`} />
                <figcaption className="tiny muted">{fmtShort(p.date)}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {progressPhotos.length > 0 && <button className="linkbtn small" onClick={() => setSheet('photos')}>Ver y administrar todas</button>}
      </section>

      {/* Logros */}
      <section className="stack">
        <h2>Logros</h2>
        <p className="small muted" style={{ margin: 0 }}>Por constancia, sin rachas que se rompan: descansar no te quita nada.</p>
        <div className="grid2">
          {ach.map((a) => (
            <div key={a.id} className={`card${a.earned ? '' : ' dashed'}`} style={{ padding: 12 }}>
              <div style={{ fontWeight: 700, color: a.earned ? 'var(--lab)' : 'var(--ink-2)' }}>{a.earned ? '● ' : '○ '}{a.title}</div>
              <div className="tiny muted">{a.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <Sheet open={sheet === 'weight'} onClose={() => setSheet(null)} title="Peso"><MeasurementForm kind="weight" onDone={() => setSheet(null)} /></Sheet>
      <Sheet open={sheet === 'waist'} onClose={() => setSheet(null)} title="Cintura"><MeasurementForm kind="waist" onDone={() => setSheet(null)} /></Sheet>
      <Sheet open={sheet === 'steps'} onClose={() => setSheet(null)} title="Pasos del día"><StepsForm onDone={() => setSheet(null)} /></Sheet>
      <Sheet open={sheet === 'photos'} onClose={() => setSheet(null)} title="Fotos de progreso">
        <div className="stack">
          {progressPhotos.map((p) => (
            <div key={p.id} className="row">
              <PhotoImg id={p.id} alt="" className="photo-thumb" style={{ width: 80, height: 100 }} />
              <div className="grow small">{fmtDay(p.date)}</div>
              <button className="linkbtn small danger" onClick={() => confirm('¿Borrar foto?') && persist(async () => {
                await softDelete('photos', p.id)
                await getDB().photoBlobs.delete(p.id)
              }, 'Foto borrada')}>Borrar</button>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function MeasurementList({ measurements }: { measurements: Measurement[] }) {
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Measurement | null>(null)
  const list = [...measurements].sort((a, b) => b.date.localeCompare(a.date))
  if (!list.length) return null
  return (
    <>
      <button className="linkbtn small" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Ver / corregir mediciones ({list.length})</button>
      <Sheet open={open} onClose={() => { setOpen(false); setEdit(null) }} title={edit ? 'Corregir medición' : 'Mediciones'}>
        {edit ? <MeasurementForm kind={edit.kind} existing={edit} onDone={() => setEdit(null)} /> : (
          <div className="list">
            {list.map((m) => (
              <div key={m.id} className="item">
                <div className="grow">
                  <strong>{String(m.value).replace('.', ',')} {m.kind === 'weight' ? 'kg' : 'cm'}</strong> <span className="small muted">{m.kind === 'weight' ? 'peso' : 'cintura'} · {fmtDay(m.date)}</span>
                </div>
                <button className="linkbtn small" onClick={() => setEdit(m)}>Editar</button>
                <button className="linkbtn small danger" onClick={() => confirm('¿Borrar medición?') && persist(() => softDelete('measurements', m.id), 'Borrada')}>Borrar</button>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </>
  )
}
