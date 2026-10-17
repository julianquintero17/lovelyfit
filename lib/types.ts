import type { DayKey } from './dates'

/** Campos comunes a todo registro sincronizable. */
export interface Base {
  id: string // UUID generado en el cliente: idempotente al reintentar
  ownerId: string
  createdAt: string // ISO
  updatedAt: string // ISO, last-write-wins
  deletedAt: string | null // borrado lógico para poder sincronizar eliminaciones
  /** Solo local: 1 = cambios sin subir. Nunca se envía al servidor. */
  dirty: 0 | 1
}

export type Source = 'manual' | 'gpx' | 'shortcut' | 'health' | 'backup' | 'seed'

export interface Profile extends Base {
  displayName: string
  ageDeclared: number | null
  ageDeclaredOn: DayKey | null
  heightCm: number | null
  /** Peso declarado sin medición fechada. No es una medición: no entra en gráficos. */
  declaredWeightKg: number | null
  declaredWeightNote: string
  goalWeightKg: number | null
  weeklySessionGoal: number
  weighInEveryDays: number
  trainingWeekdays: number[] // 0=dom … 6=sáb
  preferredTrainingTime: string
  fallbackTrainingTime: string
  workStart: string
  workEnd: string
  timezone: string
  healthNotes: string
  /** Meta de pasos entre semana: null hasta tener datos reales suficientes. */
  weekdayStepGoal: number | null
}

export type MuscleGroup = 'pecho' | 'espalda' | 'hombros' | 'bíceps' | 'tríceps' | 'piernas' | 'core' | 'cardio' | 'otro'

export interface Exercise extends Base {
  name: string
  group: MuscleGroup
  equipment: string
  instructions: string
  /** Incremento mínimo sugerido (kg) al progresar. */
  incrementKg: number
  /** Foto propia del usuario (id en tabla photos). Sin imágenes de terceros sin licencia. */
  photoId: string | null
  isCustom: boolean
  /** Clave del catálogo base (null en ejercicios propios). */
  catalogKey?: string | null
}

export interface PlanItem {
  key: string
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  restSec: number
  /** Repeticiones en reserva objetivo (~3 al empezar). */
  targetRir: number | null
  /** Para cardio dentro de la sesión: minutos en lugar de series. */
  minutes: number | null
  note: string
}

export interface Plan extends Base {
  name: string
  active: boolean
  startedOn: DayKey | null
  notes: string
}

export interface PlanDay extends Base {
  planId: string
  name: string
  order: number
  /** Día de semana sugerido (0–6) o null si es flexible. */
  weekday: number | null
  items: PlanItem[]
}

export type SessionStatus = 'in_progress' | 'done' | 'discarded'

export interface Session extends Base {
  planDayId: string | null
  name: string
  date: DayKey
  startedAt: string
  endedAt: string | null
  status: SessionStatus
  feeling: number | null // 1–5
  notes: string
}

export type Feel = 'fácil' | 'justo' | 'duro' | null

export interface SessionExercise extends Base {
  sessionId: string
  exerciseId: string
  order: number
  status: 'pending' | 'done' | 'skipped'
  substitutedFromId: string | null
  repMin: number
  repMax: number
  restSec: number
  minutes: number | null
  feel: Feel
  note: string
}

export interface WorkSet extends Base {
  sessionId: string
  sessionExerciseId: string
  exerciseId: string
  order: number
  kind: 'warmup' | 'work'
  weightKg: number | null
  reps: number | null
  rir: number | null
  done: boolean
  doneAt: string | null
}

export type ActivityType = 'caminata' | 'carrera' | 'bicicleta' | 'otro'

export interface Activity extends Base {
  date: DayKey
  type: ActivityType
  startedAt: string | null
  durationMin: number | null
  distanceKm: number | null
  avgHr: number | null
  source: Source
  externalId: string | null
  /** Solo coordenadas reales importadas. Nunca se infiere una ruta. */
  route: [number, number][] | null
  notes: string
}

export type MealSlot = 'desayuno' | 'almuerzo' | 'merienda' | 'cena' | 'colación'
export type Portion = 'chica' | 'normal' | 'grande'

export interface MealTemplate extends Base {
  title: string
  slot: MealSlot
  /** kcal estimadas para porción normal; null = sin estimación. */
  kcalNormal: number | null
  notes: string
}

export interface Meal extends Base {
  date: DayKey
  time: string
  slot: MealSlot
  templateId: string | null
  title: string
  portion: Portion
  /** null = sin estimación (distinto de 0). */
  kcalEstimate: number | null
  isFree: boolean
  photoId: string | null
  note: string
}

export type MeasurementKind = 'weight' | 'waist'

export interface Measurement extends Base {
  date: DayKey
  kind: MeasurementKind
  value: number
  note: string
  source: Source
}

export type MetricKind = 'steps' | 'active_kcal' | 'exercise_min' | 'resting_hr'

export interface DailyMetric extends Base {
  date: DayKey
  kind: MetricKind
  value: number
  source: Source
  /** Clave de deduplicación: date|kind|source. */
  dedupeKey: string
}

export interface Habit extends Base {
  name: string
  targetPerDay: number
  active: boolean
}

export interface HabitLog extends Base {
  habitId: string
  date: DayKey
  count: number
}

export type PhotoKind = 'meal' | 'progress' | 'exercise'

export interface Photo extends Base {
  kind: PhotoKind
  date: DayKey
  mime: string
  width: number
  height: number
  bytes: number
  /** Ruta en el bucket privado una vez subida. */
  storagePath: string | null
  note: string
}

/** Blob de la foto: tabla aparte, solo local. */
export interface PhotoBlob {
  id: string
  blob: Blob
}

export type ReminderKind = 'gym' | 'move_break' | 'work_end' | 'weigh_in' | 'weekly_review'

export interface Reminder extends Base {
  kind: ReminderKind
  label: string
  enabled: boolean
  time: string
  weekdays: number[]
  message: string
}

export interface MetaRow {
  key: string
  value: unknown
}

export type SyncTable =
  | 'profiles'
  | 'exercises'
  | 'plans'
  | 'planDays'
  | 'sessions'
  | 'sessionExercises'
  | 'sets'
  | 'activities'
  | 'mealTemplates'
  | 'meals'
  | 'measurements'
  | 'dailyMetrics'
  | 'habits'
  | 'habitLogs'
  | 'photos'
  | 'reminders'
