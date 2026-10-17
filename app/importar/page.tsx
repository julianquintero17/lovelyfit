'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { fmtDay } from '@/lib/dates'
import { parseShortcutParams, upsertDailyMetric } from '@/lib/imports'
import type { MetricKind } from '@/lib/types'
import { persist } from '@/components/ui'

const LABEL: Record<MetricKind, string> = { steps: 'Pasos', active_kcal: 'Energía activa (kcal)', exercise_min: 'Minutos de ejercicio', resting_hr: 'FC en reposo' }

export default function ImportPage() {
  return (
    <Suspense fallback={<p className="empty">Cargando…</p>}>
      <Import />
    </Suspense>
  )
}

function Import() {
  const params = useSearchParams()
  const parsed = parseShortcutParams(params)
  const [result, setResult] = useState<string | null>(null)

  if ('error' in parsed) {
    return (
      <div className="card stack">
        <h2>No se pudo leer el dato</h2>
        <p className="small">{parsed.error}</p>
        <Link className="btn" href="/">Ir a Hoy</Link>
      </div>
    )
  }

  async function confirmImport() {
    if ('error' in parsed) return
    const r = await persist(async () => {
      const out: string[] = []
      for (const [k, v] of Object.entries(parsed.metrics) as [MetricKind, number][]) {
        const s = await upsertDailyMetric(parsed.date, k, v, 'shortcut')
        out.push(`${LABEL[k]}: ${s === 'created' ? 'nuevo' : s === 'updated' ? 'actualizado' : 'sin cambios'}`)
      }
      return out.join(' · ')
    }, 'Datos importados')
    if (r.ok) setResult(r.value)
  }

  return (
    <div className="stack-lg">
      <h1>Importar de Salud</h1>
      <div className="card stack">
        <p className="kicker" style={{ margin: 0 }}>{fmtDay(parsed.date)} · vía Atajos</p>
        {(Object.entries(parsed.metrics) as [MetricKind, number][]).map(([k, v]) => (
          <div key={k} className="row between"><span>{LABEL[k]}</span><strong className="num" style={{ fontSize: 22 }}>{v.toLocaleString('es-AR')}</strong></div>
        ))}
        <p className="tiny muted" style={{ margin: 0 }}>
          Si ya había un dato de Atajos para ese día, se reemplaza (no se suma). Los datos manuales se guardan aparte y se muestra el mayor.
          La energía activa no se suma a ningún presupuesto de comida.
        </p>
        {result ? (
          <>
            <p className="small" role="status">✓ {result}</p>
            <Link className="btn" href="/">Ir a Hoy</Link>
          </>
        ) : (
          <button className="btn block" onClick={confirmImport} data-testid="import-confirm">Guardar</button>
        )}
      </div>
    </div>
  )
}
