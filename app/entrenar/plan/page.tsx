'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { insert, softDelete, update, uuid } from '@/lib/db'
import { weekdayLong } from '@/lib/dates'
import { useRows } from '@/lib/hooks'
import type { Exercise, Plan, PlanDay, PlanItem, Profile } from '@/lib/types'
import { useProfile } from '@/lib/hooks'
import { ExercisePicker } from '@/components/ExercisePicker'
import { IconBack, IconDown, IconUp } from '@/components/Icons'
import { Sheet, parseNum, persist } from '@/components/ui'

export default function PlanEditor() {
  const plans = useRows<Plan>('plans')
  const days = useRows<PlanDay>('planDays')
  const exercises = useRows<Exercise>('exercises')
  const { profile } = useProfile()
  const exMap = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises])
  const [pickFor, setPickFor] = useState<PlanDay | null>(null)

  const plan = plans?.find((p) => p.active) ?? plans?.[0]
  if (!plans || !days) return <p className="empty">Cargando…</p>
  if (!plan) {
    return (
      <div className="card stack">
        <h2>No hay plan</h2>
        <button className="btn" onClick={() => persist(() => insert<Plan>('plans', { name: 'Mi plan', active: true, startedOn: null, notes: '' }))}>Crear plan</button>
      </div>
    )
  }
  const planDays = days.filter((d) => d.planId === plan.id).sort((a, b) => a.order - b.order)

  const saveItems = (d: PlanDay, items: PlanItem[]) => persist(() => update<PlanDay>('planDays', d.id, { items }))

  async function syncTrainingDays(next: PlanDay[]) {
    // Mantener en el perfil los días programados (lo usan los recordatorios)
    if (!profile) return
    const wds = [...new Set(next.map((d) => d.weekday).filter((x): x is number => x != null))].sort()
    await update<Profile>('profiles', profile.id, { trainingWeekdays: wds })
  }

  return (
    <div className="stack-lg">
      <Link href="/entrenar/" className="row small" style={{ textDecoration: 'none', gap: 4 }}><IconBack width={16} /> Entrenar</Link>
      <h1>Editar plan</h1>

      <div className="card stack">
        <label className="field">
          Nombre
          <TextField value={plan.name} onSave={(name) => persist(() => update<Plan>('plans', plan.id, { name }))} />
        </label>
        <label className="field">
          Criterios / notas
          <TextField multiline value={plan.notes} onSave={(notes) => persist(() => update<Plan>('plans', plan.id, { notes }))} />
        </label>
        <p className="tiny muted" style={{ margin: 0 }}>Borrador para probar y ajustar; no es un plan profesional validado.</p>
      </div>

      {planDays.map((d, di) => (
        <section key={d.id} className="card stack">
          <div className="grid2">
            <label className="field">
              Día
              <TextField value={d.name} onSave={(name) => persist(() => update<PlanDay>('planDays', d.id, { name }))} />
            </label>
            <label className="field">
              Cuándo
              <select className="input" value={d.weekday ?? ''} onChange={(e) => {
                const weekday = e.target.value === '' ? null : Number(e.target.value)
                persist(async () => {
                  await update<PlanDay>('planDays', d.id, { weekday })
                  await syncTrainingDays(planDays.map((x) => (x.id === d.id ? { ...x, weekday } : x)))
                })
              }}>
                <option value="">Flexible</option>
                {[1, 2, 3, 4, 5, 6, 0].map((w) => <option key={w} value={w}>{weekdayLong(w)}</option>)}
              </select>
            </label>
          </div>

          <div className="list">
            {d.items.map((it, i) => (
              <ItemRow
                key={it.key}
                item={it}
                ex={exMap.get(it.exerciseId)}
                onChange={(next) => saveItems(d, d.items.map((x) => (x.key === it.key ? next : x)))}
                onRemove={() => saveItems(d, d.items.filter((x) => x.key !== it.key))}
                onMove={(dir) => {
                  const arr = [...d.items]
                  const j = i + dir
                  if (j < 0 || j >= arr.length) return
                  ;[arr[i], arr[j]] = [arr[j], arr[i]]
                  saveItems(d, arr)
                }}
              />
            ))}
          </div>
          <div className="row between">
            <button className="btn quiet sm" onClick={() => setPickFor(d)}>+ Ejercicio</button>
            <button className="linkbtn small danger" onClick={() => {
              if (confirm(`¿Borrar el día "${d.name}"? Las sesiones ya hechas no se borran.`)) {
                persist(async () => {
                  await softDelete('planDays', d.id)
                  await syncTrainingDays(planDays.filter((x) => x.id !== d.id))
                }, 'Día borrado')
              }
            }}>Borrar día</button>
          </div>
          {di === 0 && <p className="tiny muted" style={{ margin: 0 }}>Cambios en el plan no modifican sesiones ya registradas.</p>}
        </section>
      ))}

      <button className="btn quiet" onClick={() => persist(() => insert<PlanDay>('planDays', {
        planId: plan.id, name: `Día ${String.fromCharCode(65 + planDays.length)}`, order: (planDays.at(-1)?.order ?? -1) + 1, weekday: null, items: [],
      }), 'Día agregado')}>+ Agregar día</button>

      <Sheet open={!!pickFor} onClose={() => setPickFor(null)} title="Agregar al día">
        {pickFor && (
          <ExercisePicker onPick={(e) => {
            const cardio = e.group === 'cardio'
            const it: PlanItem = { key: uuid(), exerciseId: e.id, sets: cardio ? 1 : 2, repMin: cardio ? 0 : 10, repMax: cardio ? 0 : 12, restSec: cardio ? 0 : 90, targetRir: cardio ? null : 3, minutes: cardio ? 10 : null, note: '' }
            saveItems(pickFor, [...pickFor.items, it])
            setPickFor(null)
          }} />
        )}
      </Sheet>
    </div>
  )
}

function ItemRow({ item, ex, onChange, onRemove, onMove }: {
  item: PlanItem; ex?: Exercise; onChange: (i: PlanItem) => void; onRemove: () => void; onMove: (d: -1 | 1) => void
}) {
  const num = (k: keyof PlanItem, label: string, w = 64) => (
    <label className="tiny muted" style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
      {label}
      <input className="input" style={{ width: w, minHeight: 40, padding: 4, textAlign: 'center', fontSize: 16 }} inputMode="numeric"
        defaultValue={String(item[k] ?? '')}
        onBlur={(e) => {
          const n = parseNum(e.target.value)
          if (n != null && n >= 0 && n !== item[k]) onChange({ ...item, [k]: Math.round(n) })
        }} />
    </label>
  )
  return (
    <div className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <div className="row between">
        <strong className="ellipsis">{ex?.name ?? 'Ejercicio borrado'}</strong>
        <div className="row" style={{ gap: 4 }}>
          <button className="iconbtn" style={{ width: 36, height: 36 }} aria-label="Subir" onClick={() => onMove(-1)}><IconUp /></button>
          <button className="iconbtn" style={{ width: 36, height: 36 }} aria-label="Bajar" onClick={() => onMove(1)}><IconDown /></button>
          <button className="linkbtn small danger" style={{ marginLeft: 4 }} onClick={onRemove}>Quitar</button>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        {item.minutes != null ? num('minutes', 'minutos', 80) : (
          <>
            {num('sets', 'series')}
            {num('repMin', 'rep mín')}
            {num('repMax', 'rep máx')}
            {num('restSec', 'desc. (s)', 72)}
          </>
        )}
      </div>
    </div>
  )
}

function TextField({ value, onSave, multiline }: { value: string; onSave: (v: string) => void; multiline?: boolean }) {
  const [v, setV] = useState(value)
  const props = { className: 'input', value: v, onChange: (e: { target: { value: string } }) => setV(e.target.value), onBlur: () => v !== value && onSave(v) }
  return multiline ? <textarea {...props} /> : <input {...props} />
}
