'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { softDelete, update } from '@/lib/db'
import { fmtShort } from '@/lib/dates'
import { useRows } from '@/lib/hooks'
import { describeSets, fmtKg, recentPerformances, type Performance } from '@/lib/training'
import type { Exercise, MuscleGroup } from '@/lib/types'
import { IconBack } from '@/components/Icons'
import { PhotoButton, PhotoImg } from '@/components/Photo'
import { LineChart, Sheet, parseNum, persist } from '@/components/ui'

const GROUPS: MuscleGroup[] = ['pecho', 'espalda', 'hombros', 'bíceps', 'tríceps', 'piernas', 'core', 'cardio', 'otro']

export default function ExercisesPage() {
  const exercises = useRows<Exercise>('exercises')
  const [open, setOpen] = useState<Exercise | null>(null)
  const list = (exercises ?? []).sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.name.localeCompare(b.name))
  const current = open ? exercises?.find((e) => e.id === open.id) ?? null : null

  return (
    <div className="stack-lg">
      <Link href="/entrenar/" className="row small" style={{ textDecoration: 'none', gap: 4 }}><IconBack width={16} /> Entrenar</Link>
      <h1>Ejercicios</h1>
      <p className="small muted" style={{ margin: 0 }}>
        Las imágenes son tuyas: podés sacar una foto de la máquina para reconocerla. No usamos imágenes de terceros sin licencia.
      </p>
      {GROUPS.map((g) => {
        const items = list.filter((e) => e.group === g)
        if (!items.length) return null
        return (
          <section key={g} className="stack" style={{ gap: 6 }}>
            <p className="kicker" style={{ margin: 0 }}>{g}</p>
            <div className="card" style={{ padding: '4px 16px' }}>
              <div className="list">
                {items.map((e) => (
                  <button key={e.id} className="item" style={{ background: 'none', border: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpen(e)}>
                    {e.photoId ? <PhotoImg id={e.photoId} alt="" className="photo-thumb" style={{ width: 44, height: 44 }} /> : null}
                    <div className="grow"><div style={{ fontWeight: 600 }}>{e.name}</div><div className="small muted">{e.equipment || '—'}</div></div>
                    <span aria-hidden>›</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )
      })}
      <Sheet open={!!current} onClose={() => setOpen(null)} title={current?.name ?? ''}>
        {current && <ExerciseDetail ex={current} onDeleted={() => setOpen(null)} />}
      </Sheet>
    </div>
  )
}

function ExerciseDetail({ ex, onDeleted }: { ex: Exercise; onDeleted: () => void }) {
  const [perfs, setPerfs] = useState<Performance[] | null>(null)
  const [name, setName] = useState(ex.name)
  const [equipment, setEquipment] = useState(ex.equipment)
  const [instructions, setInstructions] = useState(ex.instructions)
  const [inc, setInc] = useState(fmtKg(ex.incrementKg))
  useEffect(() => { recentPerformances(ex.id, undefined, 30).then(setPerfs) }, [ex.id])

  const points = (perfs ?? []).slice().reverse().map((p) => ({ x: fmtShort(p.session.date), y: Math.max(...p.sets.map((s) => s.weightKg ?? 0)) }))
  const dirty = name !== ex.name || equipment !== ex.equipment || instructions !== ex.instructions || parseNum(inc) !== ex.incrementKg

  return (
    <div className="stack">
      {ex.photoId && <PhotoImg id={ex.photoId} alt={`Foto de ${ex.name}`} style={{ width: '100%', borderRadius: 12, maxHeight: 260, objectFit: 'cover' }} />}
      <PhotoButton kind="exercise" label={ex.photoId ? 'Cambiar foto' : 'Agregar foto propia'} onSaved={(p) => persist(() => update<Exercise>('exercises', ex.id, { photoId: p.id }), 'Foto guardada')} />

      <div className="card soft stack">
        <p className="kicker" style={{ margin: 0 }}>Carga máxima por sesión</p>
        {points.length ? <LineChart points={points} unit="kg" label={`Carga en ${ex.name}`} /> : <p className="small muted" style={{ margin: 0 }}>Sin registros todavía.</p>}
        {perfs?.[0] && <p className="small" style={{ margin: 0 }}>Última: {describeSets(perfs[0].sets)}</p>}
      </div>

      <label className="field">Nombre<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field">Equipo<input className="input" value={equipment} onChange={(e) => setEquipment(e.target.value)} /></label>
      <label className="field">Instrucciones<textarea className="input" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></label>
      <label className="field">Incremento mínimo (kg)<span className="hint">Lo que sube la máquina o el par de discos más chico.</span>
        <input className="input" inputMode="decimal" value={inc} onChange={(e) => setInc(e.target.value)} />
      </label>
      <button className="btn" disabled={!dirty || !name.trim()} onClick={() => persist(() => update<Exercise>('exercises', ex.id, {
        name: name.trim(), equipment, instructions, incrementKg: parseNum(inc) ?? ex.incrementKg,
      }), 'Ejercicio guardado')}>Guardar cambios</button>
      {ex.isCustom && (
        <button className="linkbtn small" style={{ color: 'var(--danger)', alignSelf: 'center' }} onClick={async () => {
          if (!confirm('¿Borrar este ejercicio? El historial ya registrado se conserva.')) return
          const r = await persist(() => softDelete('exercises', ex.id), 'Ejercicio borrado')
          if (r.ok) onDeleted()
        }}>Borrar ejercicio</button>
      )}
    </div>
  )
}
