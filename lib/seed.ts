import { getDB, insert, setMeta, uuid } from './db'
import { DEFAULT_TZ } from './dates'
import type { Exercise, Habit, MealTemplate, MuscleGroup, Plan, PlanDay, PlanItem, Profile, Reminder } from './types'

// Contenido inicial basado en lo que declaraste. Todo es editable y nada de esto
// es un plan profesional validado ni una indicación médica.

interface ExSeed {
  key: string
  name: string
  group: MuscleGroup
  equipment: string
  incrementKg: number
  instructions: string
}

export const EXERCISE_SEED: ExSeed[] = [
  { key: 'bench', name: 'Press banca (barra)', group: 'pecho', equipment: 'Barra', incrementKg: 2.5,
    instructions: 'Escápulas juntas y pies firmes. Bajá controlado hasta el pecho y empujá sin rebotar. Usá series de aproximación y, con cargas altas, alguien que asista o topes de seguridad.' },
  { key: 'chest_press', name: 'Press pecho en máquina', group: 'pecho', equipment: 'Máquina', incrementKg: 5,
    instructions: 'Ajustá el asiento para que las manijas queden a la altura media del pecho. Empujá sin bloquear de golpe los codos y volvé lento.' },
  { key: 'incline_press', name: 'Press inclinado en máquina', group: 'pecho', equipment: 'Máquina', incrementKg: 5,
    instructions: 'Espalda apoyada, manijas a la altura de la parte alta del pecho. Recorrido completo y controlado.' },
  { key: 'fly_machine', name: 'Aperturas en máquina', group: 'pecho', equipment: 'Máquina', incrementKg: 5,
    instructions: 'Codos levemente flexionados y fijos. Juntá adelante sin chocar y abrí hasta sentir estiramiento cómodo.' },
  { key: 'fly_db', name: 'Aperturas con mancuernas', group: 'pecho', equipment: 'Mancuernas', incrementKg: 2.5,
    instructions: 'En banco plano, codos semiflexionados. Bajá en arco hasta un estiramiento cómodo, sin forzar el hombro.' },
  { key: 'chest_row', name: 'Remo con pecho apoyado', group: 'espalda', equipment: 'Máquina / banco inclinado', incrementKg: 5,
    instructions: 'Pecho apoyado para no cargar la zona lumbar. Llevá los codos hacia atrás juntando escápulas y bajá controlado.' },
  { key: 'db_row', name: 'Remo con mancuerna con apoyo', group: 'espalda', equipment: 'Mancuerna y banco', incrementKg: 2.5,
    instructions: 'Mano y rodilla en el banco, espalda neutra. Llevá la mancuerna hacia la cadera, sin girar el torso.' },
  { key: 'seated_row', name: 'Remo sentado en polea', group: 'espalda', equipment: 'Polea', incrementKg: 5,
    instructions: 'Torso estable, sin balancearte. Tirá hacia el abdomen y dejá que los hombros se estiren al volver.' },
  { key: 'lat_pulldown', name: 'Jalón al pecho', group: 'espalda', equipment: 'Polea', incrementKg: 5,
    instructions: 'Agarre algo más ancho que hombros. Bajá la barra hacia la parte alta del pecho llevando codos abajo; evitá tirar detrás de la nuca.' },
  { key: 'pullup', name: 'Dominadas (libres o asistidas)', group: 'espalda', equipment: 'Barra fija / máquina asistida', incrementKg: 2.5,
    instructions: 'Arrancá colgado con hombros activos. Subí hasta pasar el mentón sin balanceo y bajá controlado. Si falta técnica, usá asistencia.' },
  { key: 'lateral_raise', name: 'Elevaciones laterales', group: 'hombros', equipment: 'Mancuernas / polea', incrementKg: 1,
    instructions: 'Subí los brazos hacia los costados hasta la altura de los hombros, codos levemente flexionados, sin impulso.' },
  { key: 'curl_db', name: 'Curl de bíceps con mancuernas', group: 'bíceps', equipment: 'Mancuernas', incrementKg: 1,
    instructions: 'Codos pegados al cuerpo. Subí sin balancear el torso y bajá en dos o tres segundos.' },
  { key: 'curl_bar', name: 'Curl con barra / curl 21', group: 'bíceps', equipment: 'Barra', incrementKg: 2.5,
    instructions: 'Variante 21: 7 reps en la mitad inferior, 7 en la superior y 7 completas. Registrá las 21 como una serie.' },
  { key: 'triceps_pushdown', name: 'Tríceps en polea', group: 'tríceps', equipment: 'Polea', incrementKg: 2.5,
    instructions: 'Codos fijos a los costados. Extendé completo y volvé hasta 90° sin que se adelanten los codos. La carga depende de cada máquina.' },
  { key: 'triceps_overhead', name: 'Tríceps sobre la cabeza en polea', group: 'tríceps', equipment: 'Polea', incrementKg: 2.5,
    instructions: 'De espaldas a la polea, codos apuntando al frente. Extendé sin arquear la zona lumbar.' },
  { key: 'leg_press', name: 'Prensa de piernas', group: 'piernas', equipment: 'Máquina', incrementKg: 10,
    instructions: 'Pies a la altura de hombros. Bajá hasta donde la zona lumbar siga apoyada y empujá sin bloquear las rodillas.' },
  { key: 'leg_curl', name: 'Curl femoral', group: 'piernas', equipment: 'Máquina', incrementKg: 5,
    instructions: 'Ajustá el rodillo sobre el tobillo. Flexioná completo y volvé lento, sin levantar la cadera.' },
  { key: 'leg_ext', name: 'Extensión de cuádriceps', group: 'piernas', equipment: 'Máquina', incrementKg: 5,
    instructions: 'Rodilla alineada con el eje de la máquina. Extendé y bajá controlado.' },
  { key: 'squat', name: 'Sentadilla (barra)', group: 'piernas', equipment: 'Barra / rack', incrementKg: 2.5,
    instructions: 'Opcional. Si tenés antecedentes de cuello o columna, consultá con tu especialista la posición de la barra y la carga antes de usarla. Usá topes de seguridad.' },
  { key: 'crunch', name: 'Abdominales (bloque)', group: 'core', equipment: 'Colchoneta / polea', incrementKg: 0,
    instructions: 'Tu bloque habitual de ~5 minutos. Evitá tirar del cuello con las manos.' },
  { key: 'bike', name: 'Bicicleta fija', group: 'cardio', equipment: 'Bicicleta', incrementKg: 0,
    instructions: 'Ritmo cómodo: podés hablar en frases cortas. Registrá minutos.' },
  { key: 'treadmill', name: 'Cinta (caminar)', group: 'cardio', equipment: 'Cinta', incrementKg: 0,
    instructions: 'Caminata a ritmo cómodo o con algo de inclinación.' },
]

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
    for (const e of EXERCISE_SEED) {
      const row = await insert<Exercise>('exercises', {
        name: e.name, group: e.group, equipment: e.equipment, instructions: e.instructions,
        incrementKg: e.incrementKg, photoId: null, isCustom: false,
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
