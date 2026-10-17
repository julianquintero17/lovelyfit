'use client'

import { useState } from 'react'
import { insert } from '@/lib/db'
import { useRows } from '@/lib/hooks'
import type { Exercise, MuscleGroup } from '@/lib/types'
import { persist } from './ui'

const GROUPS: MuscleGroup[] = ['pecho', 'espalda', 'hombros', 'bíceps', 'tríceps', 'piernas', 'core', 'cardio', 'otro']

export function ExercisePicker({ onPick, excludeId }: { onPick: (e: Exercise) => void; excludeId?: string }) {
  const exercises = useRows<Exercise>('exercises')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [group, setGroup] = useState<MuscleGroup>('pecho')
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const list = (exercises ?? [])
    .filter((e) => e.id !== excludeId && (!q || norm(e.name).includes(norm(q)) || norm(e.group).includes(norm(q))))
    .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.name.localeCompare(b.name))

  async function create() {
    const r = await persist(
      () => insert<Exercise>('exercises', { name: q.trim(), group, equipment: '', instructions: '', incrementKg: 2.5, photoId: null, isCustom: true }),
      'Ejercicio creado',
    )
    if (r.ok) onPick(r.value)
  }

  return (
    <div className="stack">
      <input className="input" placeholder="Buscar (ej. remo, polea, piernas)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ejercicio" />
      <div className="list">
        {list.map((e) => (
          <button key={e.id} className="item" style={{ background: 'none', border: 0, textAlign: 'left', width: '100%', cursor: 'pointer' }} onClick={() => onPick(e)}>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{e.name}</div>
              <div className="small muted">{e.group}{e.equipment ? ` · ${e.equipment}` : ''}</div>
            </div>
            <span aria-hidden>+</span>
          </button>
        ))}
        {list.length === 0 && <p className="empty small">No hay coincidencias.</p>}
      </div>
      {q.trim().length > 2 && (
        creating ? (
          <div className="card soft stack">
            <p style={{ margin: 0 }}>Crear “{q.trim()}”</p>
            <select className="input" value={group} onChange={(e) => setGroup(e.target.value as MuscleGroup)} aria-label="Grupo muscular">
              {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <button className="btn" onClick={create}>Crear y agregar</button>
          </div>
        ) : (
          <button className="btn quiet" onClick={() => setCreating(true)}>Crear ejercicio “{q.trim()}”</button>
        )
      )}
    </div>
  )
}
