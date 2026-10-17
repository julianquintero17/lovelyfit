import type { MuscleGroup } from './types'

// Catálogo base de ejercicios. Instrucciones propias, breves. La clave es estable:
// sirve para agregar ejercicios nuevos a cuentas existentes sin duplicar.

export type EquipmentKind = 'polea' | 'máquina' | 'mancuernas' | 'barra' | 'peso corporal' | 'cardio'

export interface CatalogItem {
  key: string
  name: string
  group: MuscleGroup
  kind: EquipmentKind
  incrementKg: number
  instructions: string
}

const c = (key: string, name: string, group: MuscleGroup, kind: EquipmentKind, incrementKg: number, instructions: string): CatalogItem => ({
  key, name, group, kind, incrementKg, instructions,
})

export const CATALOG: CatalogItem[] = [
  // Pecho
  c('bench', 'Press banca (barra)', 'pecho', 'barra', 2.5, 'Escápulas juntas y pies firmes. Bajá controlado hasta el pecho y empujá sin rebotar. Con cargas altas, usá topes o alguien que asista.'),
  c('incline_bench', 'Press inclinado (barra)', 'pecho', 'barra', 2.5, 'Banco a 30–45°. Bajá a la parte alta del pecho, codos a unos 45° del torso.'),
  c('db_bench', 'Press con mancuernas', 'pecho', 'mancuernas', 2, 'Mancuernas a la altura del pecho, empujá juntándolas arriba sin chocarlas.'),
  c('db_incline', 'Press inclinado con mancuernas', 'pecho', 'mancuernas', 2, 'Banco a 30°. Recorrido completo y controlado.'),
  c('chest_press', 'Press pecho en máquina', 'pecho', 'máquina', 5, 'Manijas a la altura media del pecho. Empujá sin bloquear de golpe y volvé lento.'),
  c('incline_press', 'Press inclinado en máquina', 'pecho', 'máquina', 5, 'Espalda apoyada, manijas a la altura de la parte alta del pecho.'),
  c('fly_machine', 'Aperturas en máquina (pec deck)', 'pecho', 'máquina', 5, 'Codos levemente flexionados y fijos. Juntá adelante y abrí hasta un estiramiento cómodo.'),
  c('fly_db', 'Aperturas con mancuernas', 'pecho', 'mancuernas', 2, 'Codos semiflexionados, bajá en arco sin forzar el hombro.'),
  c('cable_cross', 'Cruce de poleas', 'pecho', 'polea', 2.5, 'Poleas altas, un paso adelante. Juntá las manos frente al pecho con codos fijos.'),
  c('cable_fly_low', 'Aperturas en polea baja', 'pecho', 'polea', 2.5, 'Poleas bajas, subí las manos en arco hasta la altura del pecho.'),
  c('dips', 'Fondos en paralelas', 'pecho', 'peso corporal', 2.5, 'Torso algo inclinado. Bajá hasta donde el hombro esté cómodo; usá asistencia si hace falta.'),
  c('pushup', 'Flexiones de brazos', 'pecho', 'peso corporal', 0, 'Cuerpo en línea, bajá el pecho cerca del piso y empujá.'),
  // Espalda
  c('lat_pulldown', 'Jalón al pecho', 'espalda', 'polea', 5, 'Bajá la barra a la parte alta del pecho llevando codos abajo. Evitá tirar detrás de la nuca.'),
  c('lat_pulldown_close', 'Jalón agarre cerrado (triángulo)', 'espalda', 'polea', 5, 'Agarre neutro. Tirá hacia el pecho sin balancear el torso.'),
  c('seated_row', 'Remo sentado en polea', 'espalda', 'polea', 5, 'Torso estable, tirá hacia el abdomen y dejá que los hombros se estiren al volver.'),
  c('single_cable_row', 'Remo a una mano en polea', 'espalda', 'polea', 2.5, 'Tirá el codo hacia la cadera sin girar el torso.'),
  c('straight_arm_pulldown', 'Pullover en polea (brazos rectos)', 'espalda', 'polea', 2.5, 'Brazos casi rectos, bajá la barra hasta los muslos usando la espalda.'),
  c('face_pull', 'Face pull', 'hombros', 'polea', 2.5, 'Polea a la altura de la cara con cuerda. Tirá separando las manos, codos altos.'),
  c('chest_row', 'Remo con pecho apoyado', 'espalda', 'máquina', 5, 'Pecho apoyado para no cargar la zona lumbar. Codos atrás juntando escápulas.'),
  c('machine_row', 'Remo en máquina', 'espalda', 'máquina', 5, 'Pecho contra el apoyo, tirá hasta que los codos pasen el torso.'),
  c('db_row', 'Remo con mancuerna con apoyo', 'espalda', 'mancuernas', 2, 'Mano y rodilla en el banco, espalda neutra. Llevá la mancuerna hacia la cadera.'),
  c('barbell_row', 'Remo con barra', 'espalda', 'barra', 2.5, 'Torso inclinado y espalda neutra. Tirá la barra hacia el ombligo.'),
  c('pullup', 'Dominadas (libres o asistidas)', 'espalda', 'peso corporal', 2.5, 'Subí hasta pasar el mentón sin balanceo y bajá controlado. Si falta técnica, usá asistencia.'),
  c('assisted_pullup', 'Dominadas en máquina asistida', 'espalda', 'máquina', 5, 'Anotá el contrapeso: más contrapeso = más ayuda.'),
  c('back_ext', 'Hiperextensiones', 'espalda', 'peso corporal', 2.5, 'Bajá con la espalda neutra y subí hasta alinear el cuerpo, sin hiperextender.'),
  // Hombros
  c('shoulder_press_machine', 'Press de hombros en máquina', 'hombros', 'máquina', 5, 'Espalda apoyada, empujá hacia arriba sin arquear la zona lumbar.'),
  c('db_shoulder_press', 'Press de hombros con mancuernas', 'hombros', 'mancuernas', 2, 'Sentado con respaldo, empujá desde la altura de las orejas.'),
  c('lateral_raise', 'Elevaciones laterales', 'hombros', 'mancuernas', 1, 'Subí los brazos a los costados hasta la altura de los hombros, sin impulso.'),
  c('cable_lateral', 'Elevación lateral en polea', 'hombros', 'polea', 1.25, 'Polea baja del lado contrario. Subí el brazo hasta la altura del hombro.'),
  c('machine_lateral', 'Elevaciones laterales en máquina', 'hombros', 'máquina', 2.5, 'Codos contra los apoyos, subí hasta la altura de los hombros.'),
  c('front_raise', 'Elevaciones frontales', 'hombros', 'mancuernas', 1, 'Subí al frente hasta la altura de los ojos, sin balancear.'),
  c('rear_delt_machine', 'Pájaro en máquina (deltoides posterior)', 'hombros', 'máquina', 2.5, 'Brazos casi rectos, abrí hacia atrás juntando escápulas.'),
  c('rear_delt_db', 'Pájaro con mancuernas', 'hombros', 'mancuernas', 1, 'Torso inclinado, abrí los brazos a los costados con codos semiflexionados.'),
  // Bíceps
  c('curl_db', 'Curl de bíceps con mancuernas', 'bíceps', 'mancuernas', 1, 'Codos pegados al cuerpo. Subí sin balancear y bajá en dos o tres segundos.'),
  c('hammer_curl', 'Curl martillo', 'bíceps', 'mancuernas', 1, 'Agarre neutro (palmas enfrentadas), codos fijos.'),
  c('curl_bar', 'Curl con barra / curl 21', 'bíceps', 'barra', 2.5, 'Variante 21: 7 reps abajo, 7 arriba y 7 completas. Registralas como una serie de 21.'),
  c('cable_curl', 'Curl en polea', 'bíceps', 'polea', 2.5, 'Polea baja con barra o cuerda, codos fijos a los costados.'),
  c('preacher_curl', 'Curl predicador (Scott)', 'bíceps', 'máquina', 2.5, 'Brazos apoyados en el atril, bajá hasta casi extender.'),
  c('incline_curl', 'Curl inclinado con mancuernas', 'bíceps', 'mancuernas', 1, 'Banco a 45°, brazos colgando. Subí sin adelantar los codos.'),
  // Tríceps
  c('triceps_pushdown', 'Tríceps en polea (barra)', 'tríceps', 'polea', 2.5, 'Codos fijos a los costados. Extendé completo y volvé hasta 90°. La carga depende de cada máquina.'),
  c('rope_pushdown', 'Tríceps en polea con cuerda', 'tríceps', 'polea', 2.5, 'Al final separá las puntas de la cuerda. Codos quietos.'),
  c('triceps_overhead', 'Tríceps sobre la cabeza en polea', 'tríceps', 'polea', 2.5, 'De espaldas a la polea, codos al frente. Extendé sin arquear la zona lumbar.'),
  c('single_pushdown', 'Tríceps a una mano en polea', 'tríceps', 'polea', 1.25, 'Agarre inverso o neutro, codo pegado al cuerpo.'),
  c('skull_crusher', 'Press francés', 'tríceps', 'barra', 2.5, 'Acostado, bajá la barra hacia la frente moviendo solo los codos.'),
  c('db_kickback', 'Patada de tríceps con mancuerna', 'tríceps', 'mancuernas', 1, 'Torso inclinado, codo alto y fijo, extendé hacia atrás.'),
  c('triceps_machine', 'Tríceps en máquina (fondos)', 'tríceps', 'máquina', 5, 'Empujá hacia abajo hasta extender, sin encoger los hombros.'),
  // Piernas
  c('leg_press', 'Prensa de piernas', 'piernas', 'máquina', 10, 'Pies a la altura de hombros. Bajá hasta donde la zona lumbar siga apoyada; no bloquees las rodillas.'),
  c('hack_squat', 'Sentadilla hack (máquina)', 'piernas', 'máquina', 10, 'Espalda apoyada, bajá controlado y empujá con todo el pie.'),
  c('leg_ext', 'Extensión de cuádriceps', 'piernas', 'máquina', 5, 'Rodilla alineada con el eje de la máquina. Extendé y bajá controlado.'),
  c('leg_curl', 'Curl femoral sentado', 'piernas', 'máquina', 5, 'Ajustá el rodillo sobre el tobillo. Flexioná completo y volvé lento.'),
  c('lying_leg_curl', 'Curl femoral acostado', 'piernas', 'máquina', 5, 'Cadera apoyada en el banco durante todo el movimiento.'),
  c('hip_abductor', 'Abductores en máquina', 'piernas', 'máquina', 5, 'Abrí las piernas contra la resistencia y volvé lento.'),
  c('hip_adductor', 'Aductores en máquina', 'piernas', 'máquina', 5, 'Cerrá las piernas controlando la vuelta.'),
  c('hip_thrust', 'Hip thrust', 'piernas', 'barra', 5, 'Espalda alta en el banco, empujá la cadera hacia arriba apretando glúteos.'),
  c('glute_kickback_cable', 'Patada de glúteo en polea', 'piernas', 'polea', 2.5, 'Tobillera en polea baja, llevá la pierna atrás sin arquear la espalda.'),
  c('calf_machine', 'Gemelos en máquina', 'piernas', 'máquina', 5, 'Bajá el talón hasta estirar y subí en puntas.'),
  c('goblet_squat', 'Sentadilla goblet', 'piernas', 'mancuernas', 2, 'Mancuerna al pecho, bajá con el torso erguido.'),
  c('lunges', 'Estocadas', 'piernas', 'mancuernas', 2, 'Paso largo, rodilla de atrás cerca del piso, torso erguido.'),
  c('rdl', 'Peso muerto rumano', 'piernas', 'barra', 2.5, 'Cadera atrás con espalda neutra, barra pegada a las piernas. Bajá hasta sentir los isquios.'),
  c('squat', 'Sentadilla (barra)', 'piernas', 'barra', 2.5, 'Opcional. Si tenés antecedentes de cuello o columna, consultá con tu especialista la posición de la barra y la carga. Usá topes de seguridad.'),
  // Core
  c('crunch', 'Abdominales (bloque)', 'core', 'peso corporal', 0, 'Tu bloque habitual de ~5 minutos. Evitá tirar del cuello con las manos.'),
  c('cable_crunch', 'Crunch en polea', 'core', 'polea', 2.5, 'De rodillas, cuerda a la cabeza; flexioná el tronco hacia abajo.'),
  c('plank', 'Plancha', 'core', 'peso corporal', 0, 'Cuerpo en línea. Registrá los segundos como repeticiones.'),
  c('leg_raise', 'Elevación de piernas', 'core', 'peso corporal', 0, 'Colgado o acostado, subí las piernas sin balanceo.'),
  c('ab_machine', 'Abdominales en máquina', 'core', 'máquina', 5, 'Flexioná el tronco controlando la vuelta.'),
  c('pallof', 'Pallof press', 'core', 'polea', 1.25, 'De costado a la polea, extendé los brazos al frente sin dejar que el torso gire.'),
  // Cardio
  c('bike', 'Bicicleta fija', 'cardio', 'cardio', 0, 'Ritmo cómodo: podés hablar en frases cortas. Registrá minutos.'),
  c('treadmill', 'Cinta (caminar)', 'cardio', 'cardio', 0, 'Caminata a ritmo cómodo o con algo de inclinación.'),
  c('treadmill_run', 'Cinta (correr)', 'cardio', 'cardio', 0, 'Ritmo suave al principio. Registrá minutos y, si querés, km.'),
  c('elliptical', 'Elíptico', 'cardio', 'cardio', 0, 'Ritmo constante, registrá minutos.'),
  c('rower', 'Remo ergómetro', 'cardio', 'cardio', 0, 'Piernas, tronco y brazos en ese orden. Registrá minutos.'),
]

export const CATALOG_BY_KEY = new Map(CATALOG.map((i) => [i.key, i]))

export const KINDS: EquipmentKind[] = ['polea', 'máquina', 'mancuernas', 'barra', 'peso corporal', 'cardio']
