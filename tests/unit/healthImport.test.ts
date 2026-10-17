import { beforeEach, describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { getDB, LovelyDB, setDB } from '@/lib/db'
import { HealthAggregator, healthDateToISO, readHealthExport, saveHealthData } from '@/lib/healthImport'

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="es_AR">
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone de Julián" unit="count" startDate="2026-10-16 08:00:00 -0300" endDate="2026-10-16 08:10:00 -0300" value="3000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone de Julián" unit="count" startDate="2026-10-16 18:00:00 -0300" endDate="2026-10-16 18:10:00 -0300" value="2000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="GloryFitPro" unit="count" startDate="2026-10-16 08:00:00 -0300" endDate="2026-10-16 20:00:00 -0300" value="5600"/>
 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="GloryFitPro" unit="kJ" startDate="2026-10-16 08:00:00 -0300" endDate="2026-10-16 09:00:00 -0300" value="418.4"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="GloryFitPro" unit="count/min" startDate="2026-10-16 07:00:00 -0300" endDate="2026-10-16 07:00:00 -0300" value="60"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="GloryFitPro" unit="count/min" startDate="2026-10-16 22:00:00 -0300" endDate="2026-10-16 22:00:00 -0300" value="63">
  <MetadataEntry key="x" value="y"/>
 </Record>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Báscula" unit="lb" startDate="2026-10-16 07:05:00 -0300" endDate="2026-10-16 07:05:00 -0300" value="232"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="GloryFitPro" unit="count/min" startDate="2026-10-16 07:00:00 -0300" endDate="2026-10-16 07:00:00 -0300" value="80"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2024-01-01 10:00:00 -0300" endDate="2024-01-01 10:10:00 -0300" value="999"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="42.5" durationUnit="min" sourceName="GloryFitPro" startDate="2026-10-16 22:30:00 -0300" endDate="2026-10-16 23:12:00 -0300">
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="x" endDate="y" sum="3.4" unit="km"/>
 </Workout>
</HealthData>`

let n = 0
beforeEach(async () => {
  setDB(new LovelyDB(`health-${++n}`))
  await getDB().open()
})

describe('importar exportación de Salud', () => {
  it('agrega por día: fuentes no se suman, kJ→kcal, lb→kg, FC en reposo promedio', () => {
    const a = new HealthAggregator('2026-01-01')
    // Alimentar en pedazos chicos para probar elementos cortados entre chunks
    for (let i = 0; i < XML.length; i += 37) a.feed(XML.slice(i, i + 37))
    const r = a.result()
    const get = (k: string) => r.metrics.find((m) => m.kind === k)?.value
    expect(get('steps')).toBe(5600) // iPhone 5000 vs reloj 5600 → mayor, no 10600
    expect(get('active_kcal')).toBe(100)
    expect(get('resting_hr')).toBe(62)
    expect(r.metrics.some((m) => m.date === '2024-01-01')).toBe(false) // antes de "desde"
    expect(r.weights).toEqual([{ date: '2026-10-16', value: 105.2 }])
    expect(r.workouts).toHaveLength(1)
    expect(r.workouts[0]).toMatchObject({ day: '2026-10-16', type: 'Walking', minutes: 43, km: 3.4 })
    expect(r.workouts[0].start).toBe(healthDateToISO('2026-10-16 22:30:00 -0300'))
  })

  it('lee el zip por partes y reimportar no duplica', async () => {
    const zip = new Blob([zipSync({ 'apple_health_export/exportación.xml': strToU8(XML), 'apple_health_export/export_cda.xml': strToU8('<x/>') })])
    const data = await readHealthExport(zip, '2026-01-01')
    const first = await saveHealthData(data)
    expect(first).toMatchObject({ days: 1, steps: 1, weights: 1, workouts: 1 })
    const again = await saveHealthData(await readHealthExport(zip, '2026-01-01'))
    expect(again).toMatchObject({ weights: 0, workouts: 0 })
    expect(await getDB().dailyMetrics.count()).toBe(3)
    expect(await getDB().activities.count()).toBe(1)
    expect((await getDB().activities.toArray())[0].type).toBe('caminata')
  })

  it('avisa si el zip no es una exportación de Salud', async () => {
    const zip = new Blob([zipSync({ 'otra-cosa.txt': strToU8('hola') })])
    await expect(readHealthExport(zip, null)).rejects.toThrow(/export.xml/)
  })
})
