'use client'

import { useState } from 'react'
import { addDays, dayKey, fmtDay } from '@/lib/dates'
import { readHealthExport, saveHealthData, type HealthSummary } from '@/lib/healthImport'
import { showToast } from './ui'

/** Importa el exportar.zip de Salud (y Fitness, que guarda ahí sus datos) en el propio teléfono. */
export function HealthImport() {
  const [range, setRange] = useState<'year' | 'all'>('year')
  const [progress, setProgress] = useState<number | null>(null)
  const [stage, setStage] = useState('')
  const [result, setResult] = useState<HealthSummary | null>(null)

  async function run(file: File | undefined) {
    if (!file) return
    setResult(null)
    setProgress(0)
    setStage('Leyendo el archivo…')
    try {
      const since = range === 'year' ? addDays(dayKey(), -365) : null
      const data = await readHealthExport(file, since, (f) => setProgress(f))
      setStage('Guardando…')
      const r = await saveHealthData(data)
      setResult(r)
      showToast('Datos de Salud importados')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo leer el archivo', true)
    } finally {
      setProgress(null)
      setStage('')
    }
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
        <li>En <strong>Salud</strong>, tocá tu foto (arriba a la derecha) → <strong>Exportar todos los datos de salud</strong>.</li>
        <li>Esperá a que termine y elegí <strong>Guardar en Archivos</strong>.</li>
        <li>Volvé acá y elegí ese <code>exportar.zip</code>. Se procesa en tu teléfono.</li>
      </ol>
      <div className="seg" role="group" aria-label="Qué importar">
        <button aria-pressed={range === 'year'} onClick={() => setRange('year')}>Último año</button>
        <button aria-pressed={range === 'all'} onClick={() => setRange('all')}>Todo el historial</button>
      </div>
      {progress != null ? (
        <div className="stack" style={{ gap: 6 }} role="status">
          <div style={{ height: 10, borderRadius: 6, background: 'var(--offwhite)', border: 'var(--line)' }}>
            <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', borderRadius: 6, background: 'var(--lab)', transition: 'width .2s' }} />
          </div>
          <span className="small muted">{stage} {Math.round(progress * 100)}% · no cierres la app</span>
        </div>
      ) : (
        <label className="btn sm" style={{ alignSelf: 'flex-start' }}>
          Elegir exportar.zip
          <input type="file" accept=".zip,application/zip" hidden onChange={(e) => { run(e.target.files?.[0]); e.target.value = '' }} data-testid="health-zip" />
        </label>
      )}
      {result && (
        <div className="card soft small stack" style={{ gap: 4 }} data-testid="health-result">
          <strong>Listo: {result.days} días{result.from && result.to ? ` (${fmtDay(result.from)} → ${fmtDay(result.to)})` : ''}</strong>
          <span>Pasos: {result.steps} días · Energía activa: {result.activeKcal} · Minutos de ejercicio: {result.exerciseMin} · FC en reposo: {result.restingHr}</span>
          <span>Pesajes nuevos: {result.weights} · Entrenamientos nuevos: {result.workouts}</span>
          <span className="muted">Podés repetirlo cuando quieras: lo ya importado se actualiza, no se duplica.</span>
        </div>
      )}
      <p className="tiny muted" style={{ margin: 0 }}>
        Incluye lo de la app Fitness (anillos y entrenamientos) y lo que GloryFitPro escriba en Salud. Las rutas GPS no se importan.
      </p>
    </div>
  )
}
