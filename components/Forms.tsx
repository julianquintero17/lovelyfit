'use client'

import { useState } from 'react'
import { insert, update } from '@/lib/db'
import { dayKey, isValidDayKey } from '@/lib/dates'
import { upsertDailyMetric } from '@/lib/imports'
import { importGPX } from '@/lib/imports'
import type { Activity, ActivityType, Measurement, MeasurementKind } from '@/lib/types'
import { parseNum, persist, showToast } from './ui'

export function MeasurementForm({ kind, onDone, existing }: { kind: MeasurementKind; onDone: () => void; existing?: Measurement }) {
  const [date, setDate] = useState(existing?.date ?? dayKey())
  const [value, setValue] = useState(existing ? String(existing.value).replace('.', ',') : '')
  const [note, setNote] = useState(existing?.note ?? '')
  const v = parseNum(value)
  const [lo, hi] = kind === 'weight' ? [30, 300] : [40, 200]
  const valid = v != null && v >= lo && v <= hi && isValidDayKey(date)

  async function save() {
    if (!valid) return
    const ok = await persist(
      async () => {
        if (existing) await update<Measurement>('measurements', existing.id, { date, value: v!, note })
        else await insert<Measurement>('measurements', { date, kind, value: v!, note, source: 'manual' })
      },
      kind === 'weight' ? 'Peso guardado' : 'Cintura guardada',
    )
    if (ok.ok) onDone()
  }

  return (
    <div className="stack">
      <label className="field">
        {kind === 'weight' ? 'Peso (kg)' : 'Cintura (cm)'}
        <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus
          placeholder={kind === 'weight' ? 'ej. 105,4' : 'ej. 98'} data-testid="measure-value" />
        {kind === 'weight' && <span className="hint">Mismas condiciones cada vez: en ayunas, después del baño.</span>}
        {kind === 'waist' && <span className="hint">A la altura del ombligo, relajado, sin apretar la cinta.</span>}
      </label>
      <label className="field">
        Fecha
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        Nota <span className="hint">opcional</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {value && !valid && <p className="small danger">Revisá el valor ({lo}–{hi}).</p>}
      <button className="btn block" disabled={!valid} onClick={save} data-testid="measure-save">Guardar</button>
    </div>
  )
}

const ACT_TYPES: ActivityType[] = ['caminata', 'bicicleta', 'carrera', 'otro']

export function ActivityForm({ onDone, existing }: { onDone: () => void; existing?: Activity }) {
  const [type, setType] = useState<ActivityType>(existing?.type ?? 'caminata')
  const [date, setDate] = useState(existing?.date ?? dayKey())
  const [minutes, setMinutes] = useState(existing?.durationMin?.toString() ?? '')
  const [km, setKm] = useState(existing?.distanceKm?.toString().replace('.', ',') ?? '')
  const [hr, setHr] = useState(existing?.avgHr?.toString() ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const m = parseNum(minutes)
  const k = parseNum(km)
  const h = parseNum(hr)
  const valid = m != null && m > 0 && m < 600 && (k == null || (k >= 0 && k < 300)) && isValidDayKey(date)

  async function save() {
    if (!valid) return
    const data = { type, date, durationMin: m, distanceKm: k, avgHr: h != null ? Math.round(h) : null, notes }
    const ok = await persist(
      async () => {
        if (existing) await update<Activity>('activities', existing.id, data)
        else await insert<Activity>('activities', { ...data, startedAt: null, source: 'manual', externalId: null, route: null })
      },
      'Actividad guardada',
    )
    if (ok.ok) onDone()
  }

  async function onGPX(file: File | undefined) {
    if (!file) return
    try {
      const r = await importGPX(await file.text(), type)
      showToast(r.status === 'duplicate' ? 'Ese recorrido ya estaba importado' : 'Recorrido importado')
      onDone()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo leer el archivo', true)
    }
  }

  return (
    <div className="stack">
      <div className="chips" role="group" aria-label="Tipo">
        {ACT_TYPES.map((t) => (
          <button key={t} className="chip" aria-pressed={type === t} onClick={() => setType(t)}>{t}</button>
        ))}
      </div>
      <div className="grid2">
        <label className="field">
          Minutos
          <input className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} data-testid="act-min" />
        </label>
        <label className="field">
          Km <span className="hint">opcional</span>
          <input className="input" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
        </label>
      </div>
      <div className="grid2">
        <label className="field">
          Fecha
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          FC media <span className="hint">opcional</span>
          <input className="input" inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Nota <span className="hint">opcional</span>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button className="btn block" disabled={!valid} onClick={save} data-testid="act-save">Guardar</button>
      {!existing && (
        <div className="card soft stack">
          <p className="small" style={{ margin: 0 }}>
            <strong>¿Tenés el recorrido en un archivo GPX?</strong> Importalo y vas a ver el mapa con las coordenadas reales.
            Todavía no verificamos si GloryFitPro permite exportarlo.
          </p>
          <label className="btn quiet sm" style={{ alignSelf: 'flex-start' }}>
            Importar GPX
            <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden onChange={(e) => onGPX(e.target.files?.[0])} />
          </label>
        </div>
      )}
    </div>
  )
}

export function StepsForm({ onDone }: { onDone: () => void }) {
  const [date, setDate] = useState(dayKey())
  const [steps, setSteps] = useState('')
  const n = parseNum(steps.replace(/\./g, ''))
  const valid = n != null && n >= 0 && n < 100000 && isValidDayKey(date)
  async function save() {
    if (!valid) return
    const r = await persist(() => upsertDailyMetric(date, 'steps', Math.round(n!), 'manual'))
    if (r.ok) {
      showToast(r.value === 'updated' ? 'Pasos actualizados' : r.value === 'same' ? 'Sin cambios' : 'Pasos guardados')
      onDone()
    }
  }
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        Copiá el total del día desde Salud. Cargá días completos (el de hoy es parcial hasta la noche).
      </p>
      <label className="field">
        Pasos
        <input className="input" inputMode="numeric" value={steps} onChange={(e) => setSteps(e.target.value)} autoFocus data-testid="steps-value" />
      </label>
      <label className="field">
        Fecha
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button className="btn block" disabled={!valid} onClick={save} data-testid="steps-save">Guardar</button>
    </div>
  )
}
