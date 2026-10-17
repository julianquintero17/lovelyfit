'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { getDB, insert, nowISO, softDelete, update } from '@/lib/db'
import { fmtDay } from '@/lib/dates'
import {
  activeSession, addExerciseToSession, describeSets, discardSession, finishSession, fmtKg, lastPerformance, progressionHint,
  recentPerformances, sessionMinutes, volume, type Performance,
} from '@/lib/training'
import type { Exercise, Feel, Session, SessionExercise, WorkSet } from '@/lib/types'
import { ExercisePicker } from '@/components/ExercisePicker'
import { IconBack, IconCheck, IconDown, IconMore, IconSwap, IconUp } from '@/components/Icons'
import { Sheet, parseNum, persist, showToast, useSaveState } from '@/components/ui'

export default function SessionPage() {
  return (
    <Suspense fallback={<p className="empty">Cargando…</p>}>
      <SessionView />
    </Suspense>
  )
}

function SessionView() {
  const id = useSearchParams().get('id') ?? ''
  const router = useRouter()
  const session = useLiveQuery(() => getDB().sessions.get(id), [id])
  const ses = useLiveQuery(
    async () => (await getDB().sessionExercises.where('sessionId').equals(id).toArray()).filter((x) => !x.deletedAt).sort((a, b) => a.order - b.order),
    [id],
  )
  const sets = useLiveQuery(async () => (await getDB().sets.where('sessionId').equals(id).toArray()).filter((x) => !x.deletedAt), [id])
  // Incluye ejercicios borrados para que el historial siga mostrando su nombre
  const exercises = useLiveQuery(() => getDB().exercises.toArray(), [])
  const exMap = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises])
  const [rest, setRest] = useRestTimer(id)
  const [picker, setPicker] = useState<null | { mode: 'add' } | { mode: 'swap'; se: SessionExercise }>(null)
  const [finishing, setFinishing] = useState(false)
  const saveState = useSaveState()

  useEffect(() => {
    if (session && session.status !== 'discarded' && ses && ses.length === 0) setPicker({ mode: 'add' })
  }, [session?.status, ses?.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined || ses === undefined || sets === undefined) return <p className="empty">Cargando…</p>
  if (!session || session.deletedAt) {
    return (
      <div className="card stack">
        <h2>No encontramos esta sesión</h2>
        <Link className="btn" href="/entrenar/">Volver a Entrenar</Link>
      </div>
    )
  }

  const live = session.status === 'in_progress'
  // Las series de ejercicios omitidos no cuentan (están ocultas)
  const skippedIds = new Set(ses.filter((x) => x.status === 'skipped').map((x) => x.id))
  const workSets = sets.filter((s) => s.kind === 'work' && !skippedIds.has(s.sessionExerciseId))
  const cardioDone = ses.some((x) => x.minutes != null && x.status === 'done')
  const doneCount = workSets.filter((s) => s.done).length

  async function addExercise(e: Exercise) {
    setPicker(null)
    const order = (ses!.at(-1)?.order ?? -1) + 1
    const cardio = e.group === 'cardio'
    await persist(async () => {
      // Repetir la estructura de la última vez (series, rango, descanso); si no hay, 3 × 8–12
      const last = (await getDB().sessionExercises.where('exerciseId').equals(e.id).toArray())
        .filter((x) => !x.deletedAt && x.sessionId !== id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      const lastSets = last ? (await getDB().sets.where('sessionExerciseId').equals(last.id).toArray()).filter((x) => !x.deletedAt && x.kind === 'work').length : 0
      return addExerciseToSession(id, e.id, {
        order, sets: cardio ? 0 : Math.max(1, lastSets || 3), repMin: last?.repMin || 8, repMax: last?.repMax || 12,
        restSec: last?.restSec || 90, minutes: cardio ? last?.minutes ?? 10 : null,
      }, session!.startedAt)
    }, 'Ejercicio agregado')
  }

  async function swap(se: SessionExercise, e: Exercise) {
    setPicker(null)
    await persist(async () => {
      const db = getDB()
      await db.transaction('rw', db.tables, async () => {
        await update<SessionExercise>('sessionExercises', se.id, { exerciseId: e.id, substitutedFromId: se.substitutedFromId ?? se.exerciseId })
        const prev = await lastPerformance(e.id, id, session!.startedAt)
        const mine = sets!.filter((s) => s.sessionExerciseId === se.id).sort((a, b) => a.order - b.order)
        for (const s of mine) {
          const p = prev?.sets[s.order] ?? prev?.sets.at(-1)
          await update<WorkSet>('sets', s.id, { exerciseId: e.id, ...(s.done ? {} : { weightKg: p?.weightKg ?? null }) })
        }
      })
    }, `Cambiado por ${e.name}`)
  }

  return (
    <div className="stack-lg" style={{ paddingBottom: rest ? 90 : 0 }}>
      <div className="stack" style={{ gap: 6 }}>
        <Link href="/entrenar/" className="row small" style={{ textDecoration: 'none', gap: 4 }}><IconBack width={16} /> Entrenar</Link>
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div>
            <p className="kicker" style={{ margin: 0 }}>{live ? 'En curso' : session.status === 'done' ? 'Terminada' : 'Descartada'} · {fmtDay(session.date)}</p>
            <h1 style={{ marginTop: 4 }}>{session.name}</h1>
          </div>
          <div style={{ textAlign: 'right' }}>
            {live ? <Elapsed since={session.startedAt} /> : <span className="num" style={{ fontSize: 22 }}>{sessionMinutes(session) ?? '—'} min</span>}
            <div className="tiny muted">{doneCount}/{workSets.length} series</div>
          </div>
        </div>
        <p className={`tiny ${saveState.kind === 'err' ? 'danger' : 'muted'}`} role="status" data-testid="save-state" style={{ margin: 0 }}>
          {saveState.kind === 'err' ? `⚠ No se guardó el último cambio: ${saveState.msg}` : saveState.kind === 'ok' ? `✓ Guardado en el teléfono · ${new Date(saveState.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : 'Cada cambio se guarda en el teléfono al instante.'}
        </p>
      </div>

      {!live && session.status === 'done' && (
        <div className="card brand stack">
          <p className="kicker">Resumen</p>
          <div className="grid3">
            <div className="metric"><span className="value">{doneCount}</span><span className="label">series</span></div>
            <div className="metric"><span className="value">{Math.round(volume(sets)).toLocaleString('es-AR')}</span><span className="label">kg totales</span></div>
            <div className="metric"><span className="value">{session.feeling ?? '—'}</span><span className="label">sensación /5</span></div>
          </div>
          {session.notes && <p className="small" style={{ margin: 0 }}>{session.notes}</p>}
        </div>
      )}

      {ses.map((se, i) => (
        <ExerciseCard
          key={se.id}
          se={se}
          ex={exMap.get(se.exerciseId)}
          from={se.substitutedFromId ? exMap.get(se.substitutedFromId) : undefined}
          sets={sets.filter((s) => s.sessionExerciseId === se.id).sort((a, b) => a.order - b.order)}
          sessionId={id}
          first={i === 0}
          last={i === ses.length - 1}
          neighbors={[ses[i - 1], ses[i + 1]]}
          onRest={(sec) => setRest(sec)}
          live={live}
          startedAt={session.startedAt}
          onSwap={() => setPicker({ mode: 'swap', se })}
        />
      ))}

      <button className="btn quiet" onClick={() => setPicker({ mode: 'add' })}>+ Agregar ejercicio</button>

      {live ? (
        <div className="stack">
          <button className="btn block" onClick={() => setFinishing(true)} data-testid="finish">Terminar sesión</button>
          <button className="linkbtn" style={{ alignSelf: 'center', color: 'var(--danger)' }} onClick={async () => {
            if (!confirm('¿Descartar esta sesión? No cuenta para la meta, pero queda en tu historial como descartada.')) return
            const r = await persist(() => discardSession(id), 'Sesión descartada')
            if (r.ok) router.push('/entrenar/')
          }}>Descartar sesión</button>
        </div>
      ) : (
        <div className="row">
          {session.status === 'done' && (
            <button className="btn quiet sm" onClick={async () => {
              const other = await activeSession()
              if (other && other.id !== id) return showToast(`Primero terminá o descartá "${other.name}", que está en curso.`, true)
              persist(() => update<Session>('sessions', id, { status: 'in_progress', endedAt: null }), 'Sesión reabierta')
            }}>Reabrir</button>
          )}
          <button className="btn danger sm" onClick={async () => {
            if (!confirm('¿Borrar la sesión y todas sus series?')) return
            const r = await persist(async () => {
              for (const s of sets) await softDelete('sets', s.id)
              for (const x of ses) await softDelete('sessionExercises', x.id)
              await softDelete('sessions', id)
            }, 'Sesión borrada')
            if (r.ok) router.push('/entrenar/')
          }}>Borrar sesión</button>
        </div>
      )}

      {rest && <RestBar endsAt={rest} onDone={() => setRest(null)} onAdd={(s) => setRest(s, true)} />}

      <Sheet open={!!picker} onClose={() => setPicker(null)} title={picker?.mode === 'swap' ? 'Sustituir por…' : 'Agregar ejercicio'}>
        {picker && (
          <ExercisePicker
            excludeId={picker.mode === 'swap' ? picker.se.exerciseId : undefined}
            onPick={(e) => (picker.mode === 'swap' ? swap(picker.se, e) : addExercise(e))}
          />
        )}
      </Sheet>

      <Sheet open={finishing} onClose={() => setFinishing(false)} title="¿Cómo te sentiste?">
        <FinishForm
          pending={workSets.length - doneCount}
          nothingDone={doneCount === 0 && !cardioDone}
          onDiscard={async () => {
            const r = await persist(() => discardSession(id), 'Sesión descartada')
            if (r.ok) router.push('/entrenar/')
          }}
          onFinish={async (feeling, notes) => {
            const r = await persist(() => finishSession(id, feeling, notes), '¡Sesión guardada!')
            if (r.ok) {
              setFinishing(false)
              setRest(null)
              window.scrollTo({ top: 0 })
            }
          }}
        />
      </Sheet>
    </div>
  )
}

// ---- Tarjeta de ejercicio ------------------------------------------------------

function ExerciseCard(props: {
  se: SessionExercise
  ex: Exercise | undefined
  from: Exercise | undefined
  sets: WorkSet[]
  sessionId: string
  first: boolean
  last: boolean
  neighbors: [SessionExercise | undefined, SessionExercise | undefined]
  onRest: (sec: number) => void
  live: boolean
  startedAt: string
  onSwap: () => void
}) {
  const { se, ex, sets, sessionId } = props
  const [perfs, setPerfs] = useState<Performance[] | null>(null)
  const [menu, setMenu] = useState(false)
  const [info, setInfo] = useState(false)
  useEffect(() => {
    let alive = true
    recentPerformances(se.exerciseId, sessionId, 2, props.startedAt).then((p) => alive && setPerfs(p))
    return () => { alive = false }
  }, [se.exerciseId, sessionId])

  const prev = perfs?.[0]
  const workSets = sets.filter((x) => x.kind === 'work')
  const activeSet = sets.find((x) => !x.done)
  const doneBefore = (x: WorkSet) => [...sets].filter((y) => y.done && y.order < x.order && y.kind === x.kind).at(-1)
  const hint = perfs && ex ? progressionHint(perfs, se.repMax, ex.incrementKg) : null
  const skipped = se.status === 'skipped'
  const isCardio = se.minutes != null

  async function move(dir: -1 | 1) {
    const other = props.neighbors[dir === -1 ? 0 : 1]
    if (!other) return
    await persist(async () => {
      await update<SessionExercise>('sessionExercises', se.id, { order: other.order })
      await update<SessionExercise>('sessionExercises', other.id, { order: se.order })
    })
    setMenu(false)
  }

  async function toggleSet(s: WorkSet, placeholderReps: number | null) {
    const done = !s.done
    const patch: Partial<WorkSet> = { done, doneAt: done ? nowISO() : null }
    // Completar con un toque: si no escribiste repes, se toma lo sugerido
    if (done) {
      const ref = doneBefore(s) ?? (s.kind === 'work' ? prev?.sets[workSets.indexOf(s)] : undefined)
      if (s.reps == null) patch.reps = ref?.reps ?? placeholderReps
      if (s.weightKg == null && ref?.weightKg != null) patch.weightKg = ref.weightKg
    }
    const r = await persist(() => update<WorkSet>('sets', s.id, patch))
    if (r.ok && !done && se.status === 'done') await persist(() => update<SessionExercise>('sessionExercises', se.id, { status: 'pending' }))
    if (r.ok && done) {
      unlockAudio()
      if (props.live && s.kind === 'work') props.onRest(se.restSec || 90)
      const allDone = sets.every((x) => (x.id === s.id ? true : x.done))
      if (allDone && se.status !== 'done') await persist(() => update<SessionExercise>('sessionExercises', se.id, { status: 'done' }))
    }
  }

  return (
    <article className="card stack" style={{ opacity: skipped ? 0.6 : 1 }} data-testid="exercise-card">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 21 }}>{ex?.name ?? 'Ejercicio'}</h3>
          <p className="small muted" style={{ margin: '2px 0 0' }}>
            {isCardio ? `${se.minutes} min cómodos` : `${workSets.length} × ${se.repMin}–${se.repMax} · descanso ${se.restSec}s · ~3 en reserva`}
            {props.from && <> · <span className="accent">en lugar de {props.from.name}</span></>}
            {skipped && <> · <strong>omitido</strong></>}
          </p>
        </div>
        <button className="iconbtn" aria-label="Opciones del ejercicio" onClick={() => setMenu(true)}><IconMore /></button>
      </div>

      {!isCardio && (
        <p className="small" style={{ margin: 0 }}>
          <span className="muted">Anterior: </span>
          {perfs == null ? '…' : prev ? <>{describeSets(prev.sets)} <span className="muted">({fmtDay(prev.session.date)}{prev.feel ? `, ${prev.feel}` : ''})</span></> : <span className="muted">primera vez</span>}
        </p>
      )}
      {hint && <p className="small accent" style={{ margin: 0 }}>↑ {hint}</p>}

      {info && ex && (
        <div className="card soft small">
          {ex.instructions || 'Sin instrucciones todavía. Podés agregarlas en Ejercicios.'}
        </div>
      )}

      {!skipped && !isCardio && (
        <div>
          <div className="sethead"><span>#</span><span>kg</span><span>repes</span><span>✓</span></div>
          {sets.map((s) => {
            const wi = workSets.indexOf(s)
            const prevSet = wi >= 0 ? prev?.sets[wi] : undefined
            return (
              <SetRow key={s.id} s={s} label={s.kind === 'warmup' ? 'A' : String(wi + 1)} prevSet={prevSet}
                repHint={s.kind === 'warmup' ? se.repMin : prevSet?.reps ?? se.repMin} onToggle={toggleSet} active={s.id === activeSet?.id} />
            )
          })}
          {activeSet && (
            <SetStepper
              set={activeSet}
              increment={ex?.incrementKg || 2.5}
              before={doneBefore(activeSet)}
              fallback={workSets.indexOf(activeSet) >= 0 ? prev?.sets[workSets.indexOf(activeSet)] : undefined}
              repHint={se.repMin}
            />
          )}
          <div className="row wrap" style={{ marginTop: 6 }}>
            <button className="linkbtn small" onClick={() => {
              const lastSet = sets.at(-1)
              persist(() => insert<WorkSet>('sets', {
                sessionId, sessionExerciseId: se.id, exerciseId: se.exerciseId, order: (lastSet?.order ?? -1) + 1, kind: 'work',
                weightKg: lastSet?.weightKg ?? null, reps: null, rir: null, done: false, doneAt: null,
              }))
            }}>+ serie</button>
            <button className="linkbtn small" onClick={() => {
              const first = sets[0]
              const w = workSets[0]?.weightKg ?? prev?.sets[0]?.weightKg ?? null
              persist(() => insert<WorkSet>('sets', {
                sessionId, sessionExerciseId: se.id, exerciseId: se.exerciseId, order: (first?.order ?? 0) - 1, kind: 'warmup',
                weightKg: w != null ? Math.round(w * 0.5 / 2.5) * 2.5 : null, reps: null, rir: null, done: false, doneAt: null,
              }))
            }}>+ aproximación</button>
            {sets.length > 0 && !sets.at(-1)!.done && (
              <button className="linkbtn small" style={{ color: 'var(--ink-2)' }} onClick={() => persist(() => softDelete('sets', sets.at(-1)!.id))}>− quitar última</button>
            )}
          </div>
        </div>
      )}

      {!skipped && isCardio && <CardioRow se={se} />}

      {!skipped && !isCardio && (
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="small muted">¿Cómo se sintió?</span>
          {(['fácil', 'justo', 'duro'] as Feel[]).map((f) => (
            <button key={f} className="chip" aria-pressed={se.feel === f} onClick={() => persist(() => update<SessionExercise>('sessionExercises', se.id, { feel: se.feel === f ? null : f }))}>{f}</button>
          ))}
        </div>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={ex?.name ?? 'Ejercicio'}>
        <div className="stack">
          <button className="btn quiet" onClick={() => { setInfo(!info); setMenu(false) }}>{info ? 'Ocultar' : 'Ver'} instrucciones</button>
          <button className="btn quiet" onClick={() => { setMenu(false); props.onSwap() }}><IconSwap width={18} /> Sustituir ejercicio</button>
          <button className="btn quiet" onClick={() => { persist(() => update<SessionExercise>('sessionExercises', se.id, { status: skipped ? 'pending' : 'skipped' })); setMenu(false) }}>
            {skipped ? 'Volver a incluir' : 'Omitir hoy'}
          </button>
          <div className="grid2">
            <button className="btn quiet" disabled={props.first} onClick={() => move(-1)}><IconUp width={18} /> Subir</button>
            <button className="btn quiet" disabled={props.last} onClick={() => move(1)}><IconDown width={18} /> Bajar</button>
          </div>
          <label className="field">
            Nota del ejercicio
            <NoteInput value={se.note} onSave={(note) => persist(() => update<SessionExercise>('sessionExercises', se.id, { note }))} />
          </label>
          <button className="btn danger" onClick={async () => {
            if (!confirm('¿Quitar este ejercicio de la sesión?')) return
            await persist(async () => {
              for (const s of sets) await softDelete('sets', s.id)
              await softDelete('sessionExercises', se.id)
            }, 'Ejercicio quitado')
            setMenu(false)
          }}>Quitar de la sesión</button>
        </div>
      </Sheet>
    </article>
  )
}

function SetRow({ s, label, prevSet, repHint, onToggle, active }: { s: WorkSet; label: string; prevSet?: WorkSet; repHint: number | null; onToggle: (s: WorkSet, reps: number | null) => void; active: boolean }) {
  const [kg, setKg] = useState(s.weightKg == null ? '' : fmtKg(s.weightKg))
  const [reps, setReps] = useState(s.reps == null ? '' : String(s.reps))
  // Si el valor cambia desde afuera (sync, sustitución), reflejarlo
  // (sin pisar lo que se está tipeando, ej. "72," mientras se escribe "72,5")
  useEffect(() => {
    setKg((t) => (parseNum(t) === s.weightKg ? t : s.weightKg == null ? '' : fmtKg(s.weightKg)))
  }, [s.weightKg])
  useEffect(() => {
    setReps((t) => (parseNum(t) === s.reps ? t : s.reps == null ? '' : String(s.reps)))
  }, [s.reps])

  const commit = (field: 'weightKg' | 'reps', text: string) => {
    const n = parseNum(text)
    if (text.trim() !== '' && (n == null || n < 0)) return
    const v = field === 'reps' && n != null ? Math.round(n) : n
    if (v === s[field]) return
    persist(() => update<WorkSet>('sets', s.id, { [field]: v }))
  }

  return (
    <div className={`setrow${s.done ? ' done' : ''}${active ? ' active' : ''}${s.kind === 'warmup' ? ' warmup' : ''}`} data-testid="set-row">
      <span className="idx" title={s.kind === 'warmup' ? 'Aproximación' : undefined}>{label}</span>
      <input className="input" inputMode="decimal" aria-label={`Kilos serie ${label}`} value={kg}
        placeholder={prevSet?.weightKg != null ? fmtKg(prevSet.weightKg) : 'kg'}
        onChange={(e) => { setKg(e.target.value); commit('weightKg', e.target.value) }} />
      <input className="input" inputMode="numeric" aria-label={`Repeticiones serie ${label}`} value={reps}
        placeholder={repHint != null ? String(repHint) : 'reps'}
        onChange={(e) => { setReps(e.target.value); commit('reps', e.target.value) }} />
      <button className="check" aria-pressed={s.done} aria-label={s.done ? `Desmarcar serie ${label}` : `Completar serie ${label}`} onClick={() => onToggle(s, repHint)} data-testid="set-check">
        <IconCheck />
      </button>
    </div>
  )
}

/** Panel rápido para la serie activa: sin teclado para lo común. */
function SetStepper({ set, increment, before, fallback, repHint }: { set: WorkSet; increment: number; before?: WorkSet; fallback?: WorkSet; repHint: number }) {
  const save = (patch: Partial<WorkSet>) => persist(() => update<WorkSet>('sets', set.id, patch))
  const kg = set.weightKg ?? before?.weightKg ?? fallback?.weightKg ?? 0
  const reps = set.reps ?? before?.reps ?? fallback?.reps ?? repHint
  const src = before ?? fallback
  const step = (v: number, d: number, min = 0) => Math.max(min, Math.round((v + d) * 100) / 100)
  return (
    <div className="stepper" data-testid="set-stepper">
      <div className="stepper-row">
        <span className="tiny muted">kg</span>
        <button className="stepbtn" aria-label={`Restar ${fmtKg(increment)} kg`} onClick={() => save({ weightKg: step(kg, -increment) })}>−{fmtKg(increment)}</button>
        <span className="num stepval">{fmtKg(set.weightKg ?? kg)}</span>
        <button className="stepbtn" aria-label={`Sumar ${fmtKg(increment)} kg`} onClick={() => save({ weightKg: step(kg, increment) })}>+{fmtKg(increment)}</button>
      </div>
      <div className="stepper-row">
        <span className="tiny muted">repes</span>
        <button className="stepbtn" aria-label="Restar una repetición" onClick={() => save({ reps: step(reps, -1, 1) })}>−1</button>
        <span className="num stepval">{set.reps ?? reps}</span>
        <button className="stepbtn" aria-label="Sumar una repetición" onClick={() => save({ reps: step(reps, 1) })}>+1</button>
      </div>
      <div className="row wrap" style={{ gap: 6, justifyContent: 'space-between' }}>
        {src && (
          <button className="chip" onClick={() => save({ weightKg: src.weightKg, reps: src.reps })} data-testid="repeat-set">
            Igual que {before ? 'la anterior' : 'la vez pasada'} ({fmtKg(src.weightKg)}×{src.reps ?? '—'})
          </button>
        )}
        <div className="row" style={{ gap: 6 }} role="group" aria-label="Repeticiones en reserva">
          <span className="tiny muted">RIR</span>
          {[0, 1, 2, 3].map((n) => (
            <button key={n} className="chip" style={{ minWidth: 44, justifyContent: 'center', padding: 0 }} aria-pressed={set.rir === n}
              onClick={() => save({ rir: set.rir === n ? null : n })}>{n === 3 ? '3+' : n}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

function CardioRow({ se }: { se: SessionExercise }) {
  const [min, setMin] = useState(String(se.minutes ?? ''))
  return (
    <div className="row">
      <input className="input" style={{ maxWidth: 110, textAlign: 'center' }} inputMode="numeric" aria-label="Minutos" value={min}
        onChange={(e) => {
          setMin(e.target.value)
          const n = parseNum(e.target.value)
          if (n != null && n >= 0) persist(() => update<SessionExercise>('sessionExercises', se.id, { minutes: n }))
        }} />
      <span className="small muted grow">minutos</span>
      <button className="check" aria-pressed={se.status === 'done'} aria-label="Marcar hecho"
        onClick={() => persist(() => update<SessionExercise>('sessionExercises', se.id, { status: se.status === 'done' ? 'pending' : 'done' }))}>
        <IconCheck />
      </button>
    </div>
  )
}

function NoteInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  return <input className="input" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} placeholder="ej. máquina 3, asiento en 4" />
}

function FinishForm({ pending, nothingDone, onFinish, onDiscard }: { pending: number; nothingDone: boolean; onFinish: (feeling: number | null, notes: string) => void; onDiscard: () => void }) {
  const [feeling, setFeeling] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  return (
    <div className="stack">
      {nothingDone ? (
        <div className="card soft stack">
          <p className="small" style={{ margin: 0 }}>No marcaste ninguna serie. Si hoy no se pudo, descartala: no cuenta para la meta y no pasa nada.</p>
          <button className="btn quiet sm" onClick={onDiscard}>Descartar sesión</button>
        </div>
      ) : pending > 0 && <p className="small muted" style={{ margin: 0 }}>Quedan {pending} series sin marcar. Está bien: se guardan como no hechas.</p>}
      <div className="row" style={{ justifyContent: 'space-between' }} role="group" aria-label="Sensación general">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className="chip" style={{ width: 52, height: 52, justifyContent: 'center', fontSize: 18 }} aria-pressed={feeling === n} onClick={() => setFeeling(n)}>{n}</button>
        ))}
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>1 = muy pesado · 5 = excelente</p>
      <label className="field">
        Notas <span className="hint">opcional · molestias, energía, cambios</span>
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <p className="tiny muted" style={{ margin: 0 }}>Si notaste algún síntoma fuera de lo normal, anotalo y consultá a tu especialista.</p>
      <button className="btn block" onClick={() => onFinish(feeling, notes)} data-testid="finish-confirm">Guardar sesión</button>
    </div>
  )
}

// ---- Tiempo ------------------------------------------------------------------

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(h)
  }, [])
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000))
  const mm = Math.floor(s / 60)
  return <span className="num" style={{ fontSize: 26 }}>{mm}:{String(s % 60).padStart(2, '0')}</span>
}

/** Descanso basado en hora de fin (sobrevive a recargas y a la pantalla bloqueada). */
function useRestTimer(sessionId: string): [number | null, (sec: number | null, add?: boolean) => void] {
  const key = `rest:${sessionId}`
  const [endsAt, setEndsAt] = useState<number | null>(null)
  useEffect(() => {
    try {
      const v = Number(sessionStorage.getItem(key))
      if (v > Date.now()) setEndsAt(v)
    } catch { /* sin storage: sin persistencia del descanso */ }
  }, [key])
  const set = (sec: number | null, add = false) => {
    const base = add && endsAt && endsAt > Date.now() ? endsAt : Date.now()
    const v = sec == null ? null : base + sec * 1000
    setEndsAt(v)
    try {
      if (v) sessionStorage.setItem(key, String(v))
      else sessionStorage.removeItem(key)
    } catch { /* ignorar */ }
  }
  return [endsAt, set]
}

function RestBar({ endsAt, onDone, onAdd }: { endsAt: number; onDone: () => void; onAdd: (sec: number) => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(h)
  }, [])
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000))
  useEffect(() => {
    if (left === 0) {
      beep()
      try { navigator.vibrate?.(200) } catch { /* iOS no vibra desde la web */ }
    }
  }, [left])
  return (
    <div className="restbar" role="timer" data-testid="rest-bar">
      <span className="sr-only" role="status">{left === 0 ? 'Descanso terminado. A la próxima serie.' : ''}</span>
      <div className="grow">
        <div className="tiny" style={{ opacity: 0.8 }}>{left === 0 ? '¡A la próxima serie!' : 'Descanso'}</div>
        <div className="num">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>
      </div>
      <button className="btn sm light" onClick={() => onAdd(30)}>+30s</button>
      <button className="btn sm light" onClick={onDone}>{left === 0 ? 'Cerrar' : 'Saltar'}</button>
    </div>
  )
}

// ---- Aviso sonoro ------------------------------------------------------------
// iOS no vibra desde la web y solo permite audio iniciado tras un toque:
// el primer check de serie "desbloquea" el audio y al terminar el descanso suena un beep corto.
let audioCtx: AudioContext | null = null
function unlockAudio() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!audioCtx && Ctx) audioCtx = new Ctx()
    if (audioCtx?.state === 'suspended') audioCtx.resume()
  } catch { /* sin audio */ }
}
function beep() {
  if (!audioCtx) return
  try {
    const t = audioCtx.currentTime
    for (const [i, f] of [880, 1320].entries()) {
      const o = audioCtx.createOscillator()
      const g = audioCtx.createGain()
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t + i * 0.18)
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16)
      o.connect(g).connect(audioCtx.destination)
      o.start(t + i * 0.18)
      o.stop(t + i * 0.18 + 0.17)
    }
  } catch { /* sin audio */ }
}
