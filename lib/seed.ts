import { currentOwnerId, getDB, insert, setMeta, update, uuid } from './db'
import { CATALOG } from './catalog'
import { DEFAULT_TZ } from './dates'
import type { Exercise, Habit, MealTemplate, MuscleGroup, Plan, PlanDay, PlanItem, Profile, Reminder } from './types'

// Contenido inicial basado en lo que declaraste. Todo es editable y nada de esto
// es un plan profesional validado ni una indicación médica.

const item = (exerciseId: string, sets: number, repMin: number, repMax: number, restSec: number, minutes: number | null = null): PlanItem => ({
  key: uuid(), exerciseId, sets, repMin, repMax, restSec, targetRir: minutes ? null : 3, minutes, note: '',
})

type ProfileFields = Omit<Profile, keyof import('./types').Base>

// Los datos personales llegan del onboarding o de la invitación: nada personal vive en el código.
export async function seedFor(input: Partial<ProfileFields> = {}): Promise<void> {
  const db = getDB()
  await db.transaction('rw', db.tables, async () => {
    const defaults: ProfileFields = {
      displayName: 'Yo',
      ageDeclared: null,
      ageDeclaredOn: null,
      heightCm: null,
      declaredWeightKg: null,
      declaredWeightNote: '',
      goalWeightKg: null,
      weeklySessionGoal: 4,
      weighInEveryDays: 14,
      trainingWeekdays: [1, 2, 4, 6],
      preferredTrainingTime: '07:00',
      fallbackTrainingTime: '17:30',
      workStart: '09:00',
      workEnd: '18:00',
      timezone: DEFAULT_TZ,
      healthNotes: '',
      weekdayStepGoal: null,
    }
    const known = Object.fromEntries(Object.entries(input).filter(([k, v]) => k in defaults && v !== undefined))
    const profile = { ...defaults, ...known } as ProfileFields
    if (profile.declaredWeightKg != null && !profile.declaredWeightNote) profile.declaredWeightNote = 'Aproximado, declarado sin fecha de medición.'
    await insert<Profile>('profiles', profile)

    const ex: Record<string, string> = {}
    for (const e of CATALOG) {
      const row = await insert<Exercise>('exercises', {
        name: e.name, group: e.group, equipment: e.kind, instructions: e.instructions,
        incrementKg: e.incrementKg, photoId: null, isCustom: false, catalogKey: e.key,
      })
      ex[e.key] = row.id
    }

    const plan = await insert<Plan>('plans', {
      name: 'Plan inicial 4 días (borrador)',
      active: true,
      startedOn: null,
      notes:
        'Propuesta para probar y ajustar. Empezá dejando ~3 repeticiones en reserva. Progresá con el incremento mínimo cuando completes el rango con técnica y margen dos sesiones seguidas. No hace falta llegar al fallo ni recuperar sesiones perdidas.',
    })

    const days: Array<Omit<PlanDay, keyof import('./types').Base>> = [
      { planId: plan.id, name: 'A · Torso', order: 0, weekday: 1, items: [
        item(ex.bench, 3, 8, 10, 120), item(ex.chest_row, 3, 8, 12, 105), item(ex.pullup, 2, 6, 8, 120),
        item(ex.lateral_raise, 2, 12, 15, 75), item(ex.curl_db, 2, 10, 12, 60), item(ex.triceps_pushdown, 2, 10, 12, 60),
      ] },
      { planId: plan.id, name: 'B · Mixto', order: 1, weekday: 2, items: [
        item(ex.leg_press, 2, 10, 12, 120), item(ex.leg_curl, 2, 10, 15, 90), item(ex.chest_press, 2, 10, 12, 90),
        item(ex.seated_row, 2, 10, 12, 90), item(ex.bike, 1, 0, 0, 0, 10),
      ] },
      { planId: plan.id, name: 'C · Torso', order: 2, weekday: 4, items: [
        item(ex.incline_press, 3, 8, 12, 105), item(ex.lat_pulldown, 3, 8, 12, 105), item(ex.fly_machine, 2, 10, 15, 75),
        item(ex.db_row, 2, 10, 12, 90), item(ex.curl_db, 2, 10, 12, 60), item(ex.triceps_pushdown, 2, 10, 12, 60),
      ] },
      { planId: plan.id, name: 'D · Mixto', order: 3, weekday: 6, items: [
        item(ex.leg_press, 2, 10, 12, 120), item(ex.leg_curl, 2, 10, 15, 90), item(ex.lat_pulldown, 2, 10, 12, 90),
        item(ex.chest_press, 2, 10, 12, 90), item(ex.bike, 1, 0, 0, 0, 10),
      ] },
    ]
    for (const d of days) await insert<PlanDay>('planDays', d)

    const templates: Array<[string, MealTemplate['slot']]> = [
      ['Tostada con huevo y café', 'desayuno'],
      ['Yogur con avena / granola / frutos secos', 'desayuno'],
      ['Banana antes del gym', 'colación'],
      ['Pollo con ensalada', 'almuerzo'],
      ['Pollo con verduras salteadas y papa', 'almuerzo'],
      ['Milanesa de pollo con ensalada', 'cena'],
      ['Wrap de rapiditas con pollo y verduras', 'cena'],
      ['Cerdo con verduras', 'cena'],
      ['Huevos revueltos (merienda)', 'merienda'],
      ['Fruta', 'colación'],
      ['Hamburguesa (finde)', 'cena'],
      ['Chocolate / picoteo', 'colación'],
    ]
    for (const [title, slot] of templates) {
      await insert<MealTemplate>('mealTemplates', { title, slot, kcalNormal: null, notes: '' })
    }

    await insert<Habit>('habits', { name: 'Pausa activa (3–5 min)', targetPerDay: 2, active: true })
    await insert<Habit>('habits', { name: 'Noche sin picoteo', targetPerDay: 1, active: true })

    const reminders: Array<Omit<Reminder, keyof import('./types').Base>> = [
      { kind: 'gym', label: 'Gimnasio por la tarde', enabled: false, time: '16:30', weekdays: [1, 2, 4, 6],
        message: '¿Hoy toca gym? Si todavía no entrenaste, la tarde está libre para vos.' },
      { kind: 'move_break', label: 'Pausa de movimiento', enabled: false, time: '10:30', weekdays: [1, 2, 3, 4, 5],
        message: 'Tres minutos para moverte: aprovechá el mate y caminá un poco.' },
      { kind: 'move_break', label: 'Pausa de movimiento (tarde)', enabled: false, time: '15:30', weekdays: [1, 2, 3, 4, 5],
        message: 'Otra pausa corta: estirá, caminá, volvé.' },
      { kind: 'work_end', label: 'Cierre laboral', enabled: false, time: '17:45', weekdays: [1, 2, 3, 4, 5],
        message: 'Buen momento para ir cerrando el día.' },
      { kind: 'weigh_in', label: 'Pesaje quincenal', enabled: false, time: '07:15', weekdays: [1],
        message: 'Toca pesaje: en ayunas, después del baño. Es un dato, no un juicio.' },
      { kind: 'weekly_review', label: 'Revisión semanal', enabled: false, time: '20:00', weekdays: [0],
        message: '¿Cómo fue la semana? Mirá tu progreso en dos minutos.' },
    ]
    for (const r of reminders) await insert<Reminder>('reminders', r)
  })
  await setMeta('seeded', true)
}

// Nombres de versiones anteriores del catálogo → clave actual
const LEGACY_NAMES: Record<string, string> = {
  'Tríceps en polea': 'triceps_pushdown',
  'Curl femoral': 'leg_curl',
  'Aperturas en máquina': 'fly_machine',
}

/**
 * Agrega a la cuenta los ejercicios del catálogo que le falten (sin duplicar)
 * y completa la clave en los que ya existían. Idempotente.
 */
export async function ensureCatalog(): Promise<number> {
  const db = getDB()
  if ((await db.profiles.count()) === 0) return 0
  const ownerId = await currentOwnerId()
  // Transacción: dos ejecuciones simultáneas no pueden insertar lo mismo dos veces
  return db.transaction('rw', db.exercises, db.meta, async () => {
    const all = await db.exercises.toArray()
    const byKey = new Set(all.map((e) => e.catalogKey).filter(Boolean))
    const norm = (n: string) => n.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
    const legacy = all.filter((e) => !e.catalogKey && !e.isCustom)
    let added = 0
    for (const item of CATALOG) {
      if (byKey.has(item.key)) continue
      const match = legacy.find((e) => norm(e.name) === norm(item.name) || LEGACY_NAMES[e.name] === item.key)
      if (match) {
        await update<Exercise>('exercises', match.id, { catalogKey: item.key, name: item.name, equipment: item.kind })
        legacy.splice(legacy.indexOf(match), 1)
        continue
      }
      // Id determinístico por cuenta + clave: dos dispositivos convergen en la misma fila al sincronizar
      await insert<Exercise>('exercises', {
        id: stableId(`${ownerId}:${item.key}`),
        name: item.name, group: item.group, equipment: item.kind, instructions: item.instructions,
        incrementKg: item.incrementKg, photoId: null, isCustom: false, catalogKey: item.key,
      })
      added++
    }
    return added
  })
}

/** UUID con formato v4 derivado de un texto (FNV-1a de 32 bits, 4 semillas). No criptográfico. */
export function stableId(text: string): string {
  const h = (seed: number) => {
    let x = seed >>> 0
    for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 16777619) >>> 0
    return x.toString(16).padStart(8, '0')
  }
  const hex = h(2166136261) + h(0x9e3779b9) + h(0x85ebca6b) + h(0xc2b2ae35)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
