'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { getDB, insert } from '@/lib/db'
import { useRows } from '@/lib/hooks'
import { KINDS, type EquipmentKind } from '@/lib/catalog'
import type { Exercise, MuscleGroup } from '@/lib/types'
import { persist } from './ui'

const GROUPS: MuscleGroup[] = ['pecho', 'espalda', 'hombros', 'bíceps', 'tríceps', 'piernas', 'core', 'cardio', 'otro']
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Grilla para elegir ejercicios tocando: recientes, músculo, equipo y búsqueda. */
export function ExercisePicker({ onPick, excludeId }: { onPick: (e: Exercise) => void; excludeId?: string }) {
  const exercises = useRows<Exercise>('exercises')
  const recentIds = useLiveQuery(async () => {
    const list = (await getDB().sessionExercises.orderBy('updatedAt').reverse().limit(60).toArray()).filter((x) => !x.deletedAt)
    return [...new Set(list.map((x) => x.exerciseId))].slice(0, 8)
  }, [])
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<MuscleGroup | 'recientes' | 'todos'>('todos')
  const [kind, setKind] = useState<EquipmentKind | null>(null)
  const [creating, setCreating] = useState(false)
  const [newGroup, setNewGroup] = useState<MuscleGroup>('pecho')

  // Un ejercicio del catálogo puede llegar duplicado de dos dispositivos: mostrar uno
  const unique = useMemo(() => {
    const seen = new Set<string>()
    return (exercises ?? []).filter((e) => {
      if (!e.catalogKey) return true
      if (seen.has(e.catalogKey)) return false
      seen.add(e.catalogKey)
      return true
    })
  }, [exercises])

  const byId = new Map(unique.map((e) => [e.id, e]))
  const recents = (recentIds ?? []).map((id) => byId.get(id)).filter((e): e is Exercise => !!e && e.id !== excludeId)
  const list = (group === 'recientes' ? recents : unique)
    .filter((e) => e.id !== excludeId)
    .filter((e) => group === 'todos' || group === 'recientes' || e.group === group)
    .filter((e) => !kind || e.equipment === kind)
    .filter((e) => !q || norm(e.name).includes(norm(q)) || norm(e.group).includes(norm(q)) || norm(e.equipment).includes(norm(q)))
    .sort((a, b) => (group === 'recientes' ? 0 : GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.name.localeCompare(b.name)))

  async function create() {
    const r = await persist(
      () => insert<Exercise>('exercises', { name: q.trim(), group: newGroup, equipment: kind ?? '', instructions: '', incrementKg: 2.5, photoId: null, isCustom: true, catalogKey: null }),
      'Ejercicio creado',
    )
    if (r.ok) onPick(r.value)
  }

  return (
    <div className="stack">
      <input className="input" placeholder="Buscar: polea, remo, prensa…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ejercicio" />
      <div className="chips scroll-x" role="group" aria-label="Grupo muscular">
        {recents.length > 0 && <button className="chip" aria-pressed={group === 'recientes'} onClick={() => setGroup('recientes')}>Recientes</button>}
        <button className="chip" aria-pressed={group === 'todos'} onClick={() => setGroup('todos')}>Todos</button>
        {GROUPS.filter((g) => g !== 'otro').map((g) => (
          <button key={g} className="chip" aria-pressed={group === g} onClick={() => setGroup(g)} style={{ textTransform: 'capitalize' }}>{g}</button>
        ))}
      </div>
      <div className="chips scroll-x" role="group" aria-label="Equipo">
        {KINDS.map((k) => (
          <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)} style={{ textTransform: 'capitalize' }}>{k}</button>
        ))}
      </div>
      <div className="exgrid">
        {list.map((e) => (
          <button key={e.id} className="extile" onClick={() => onPick(e)} data-testid="exercise-tile">
            <span className="extile-name">{e.name}</span>
            <span className="tiny muted" style={{ textTransform: 'capitalize' }}>{e.group}{e.equipment ? ` · ${e.equipment}` : ''}</span>
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="empty small">No hay coincidencias.</p>}
      {q.trim().length > 2 && (
        creating ? (
          <div className="card soft stack">
            <p style={{ margin: 0 }}>Crear “{q.trim()}”</p>
            <select className="input" value={newGroup} onChange={(e) => setNewGroup(e.target.value as MuscleGroup)} aria-label="Grupo muscular">
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
