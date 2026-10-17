'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { insert, softDelete, update } from '@/lib/db'
import { addDays, fmtDay, timeHM, weekDays } from '@/lib/dates'
import { useProfile, useRows, useToday } from '@/lib/hooks'
import { kcalForPortion } from '@/lib/stats'
import type { Meal, MealSlot, MealTemplate, Portion } from '@/lib/types'
import { PhotoButton, PhotoImg } from '@/components/Photo'
import { Sheet, parseNum, persist } from '@/components/ui'

const SLOTS: MealSlot[] = ['desayuno', 'almuerzo', 'merienda', 'cena', 'colación']
const PORTIONS: Portion[] = ['chica', 'normal', 'grande']

export default function MealsPage() {
  return (
    <Suspense fallback={<p className="empty">Cargando…</p>}>
      <Meals />
    </Suspense>
  )
}

function Meals() {
  const params = useSearchParams()
  const router = useRouter()
  const { profile } = useProfile()
  const today = useToday(profile?.timezone)
  const [day, setDay] = useState(today)
  const meals = useRows<Meal>('meals')
  const templates = useRows<MealTemplate>('mealTemplates')
  const [editing, setEditing] = useState<Meal | 'new' | null>(null)
  const [tplOpen, setTplOpen] = useState(false)

  useEffect(() => {
    if (params.get('nueva') === '1') {
      setEditing('new')
      router.replace('/comidas/')
    }
  }, [params, router])

  const dayMeals = (meals ?? []).filter((m) => m.date === day).sort((a, b) => a.time.localeCompare(b.time))
  const est = dayMeals.filter((m) => m.kcalEstimate != null)
  const kcal = est.reduce((a, m) => a + (m.kcalEstimate ?? 0), 0)
  const week = weekDays(day)
  const freeThisWeek = (meals ?? []).filter((m) => m.isFree && m.date >= week[0] && m.date <= week[6]).length

  return (
    <div className="stack-lg">
      <div className="row between">
        <h1>Comidas</h1>
        <button className="btn sm ghost" onClick={() => setTplOpen(true)}>Habituales</button>
      </div>

      <div className="row between card soft" style={{ padding: 8 }}>
        <button className="iconbtn" aria-label="Día anterior" onClick={() => setDay(addDays(day, -1))}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{day === today ? 'Hoy' : fmtDay(day)}</div>
          <div className="tiny muted">{dayMeals.length} comidas · {freeThisWeek} libre{freeThisWeek === 1 ? '' : 's'} esta semana</div>
        </div>
        <button className="iconbtn" aria-label="Día siguiente" onClick={() => setDay(addDays(day, 1))} disabled={day >= today}>›</button>
      </div>

      <button className="btn block" onClick={() => setEditing('new')} data-testid="add-meal">+ Registrar comida</button>

      {dayMeals.length === 0 ? (
        <p className="empty">Sin comidas registradas {day === today ? 'hoy' : 'este día'}.</p>
      ) : (
        <div className="card" style={{ padding: '4px 16px' }}>
          <div className="list">
            {dayMeals.map((m) => (
              <button key={m.id} className="item" style={{ background: 'none', border: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => setEditing(m)}>
                {m.photoId ? <PhotoImg id={m.photoId} alt="" className="photo-thumb" /> : null}
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 600 }}>{m.title}</div>
                  <div className="small muted">
                    {m.time} · {m.slot} · porción {m.portion}{m.isFree ? ' · libre' : ''}
                  </div>
                </div>
                <span className={`badge ${m.kcalEstimate == null ? 'neutral' : 'ok'}`}>{m.kcalEstimate == null ? 'sin estimación' : `~${m.kcalEstimate} kcal`}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {dayMeals.length > 0 && (
        <p className="small muted" style={{ margin: 0 }} data-testid="kcal-summary">
          {est.length === 0
            ? 'Ninguna comida tiene estimación de calorías: no mostramos un total.'
            : `~${kcal} kcal estimadas en ${est.length} de ${dayMeals.length} comidas${est.length < dayMeals.length ? ' (total incompleto)' : ''}.`}
        </p>
      )}

      <div className="card dashed small muted">
        Sin meta calórica por ahora: faltan datos (porciones, bebidas, gasto real). Las calorías son estimaciones tuyas, editables.
        Una foto guardada no es una comida analizada.
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Registrar comida' : 'Editar comida'}>
        {editing !== null && (
          <MealForm key={editing === 'new' ? 'new' : editing.id} meal={editing === 'new' ? null : editing} day={day} templates={templates ?? []} tz={profile?.timezone} onDone={() => setEditing(null)} />
        )}
      </Sheet>
      <Sheet open={tplOpen} onClose={() => setTplOpen(false)} title="Comidas habituales">
        <TemplatesEditor templates={templates ?? []} />
      </Sheet>
    </div>
  )
}

function MealForm({ meal, day, templates, tz, onDone }: { meal: Meal | null; day: string; templates: MealTemplate[]; tz?: string; onDone: () => void }) {
  const [templateId, setTemplateId] = useState<string | null>(meal?.templateId ?? null)
  const [title, setTitle] = useState(meal?.title ?? '')
  const [slot, setSlot] = useState<MealSlot>(meal?.slot ?? guessSlot(timeHM(new Date(), tz)))
  const [portion, setPortion] = useState<Portion>(meal?.portion ?? 'normal')
  const [kcal, setKcal] = useState(meal?.kcalEstimate != null ? String(meal.kcalEstimate) : '')
  const [kcalTouched, setKcalTouched] = useState(!!meal)
  const [isFree, setIsFree] = useState(meal?.isFree ?? false)
  const [photoId, setPhotoId] = useState<string | null>(meal?.photoId ?? null)
  const [note, setNote] = useState(meal?.note ?? '')
  const [time, setTime] = useState(meal?.time ?? timeHM(new Date(), tz))
  const [saveTpl, setSaveTpl] = useState(false)

  const tpl = templates.find((t) => t.id === templateId)
  // Sugerencia desde la plantilla, solo si el usuario no escribió su propio valor
  useEffect(() => {
    if (kcalTouched) return
    const v = kcalForPortion(tpl?.kcalNormal ?? null, portion)
    setKcal(v == null ? '' : String(v))
  }, [tpl, portion, kcalTouched])

  const kcalNum = parseNum(kcal)
  const valid = title.trim().length > 0 && (kcal.trim() === '' || (kcalNum != null && kcalNum >= 0 && kcalNum < 5000))

  async function save() {
    const data = { date: meal?.date ?? day, time, slot, templateId, title: title.trim(), portion, kcalEstimate: kcalNum == null ? null : Math.round(kcalNum), isFree, photoId, note }
    const r = await persist(async () => {
      if (meal) await update<Meal>('meals', meal.id, data)
      else await insert<Meal>('meals', data)
      if (saveTpl && !templateId) {
        const normal = kcalNum == null ? null : Math.round(kcalNum / (portion === 'chica' ? 0.75 : portion === 'grande' ? 1.3 : 1))
        await insert<MealTemplate>('mealTemplates', { title: title.trim(), slot, kcalNormal: normal, notes: '' })
      }
    }, 'Comida guardada')
    if (r.ok) onDone()
  }

  return (
    <div className="stack">
      {!meal && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 600 }}>Habituales</span>
          <div className="chips">
            {[...templates].sort((a, b) => (a.slot === slot ? -1 : 0) - (b.slot === slot ? -1 : 0)).map((t) => (
              <button key={t.id} className="chip" aria-pressed={templateId === t.id} onClick={() => {
                if (templateId === t.id) { setTemplateId(null); return }
                setTemplateId(t.id); setTitle(t.title); setSlot(t.slot)
              }}>{t.title}</button>
            ))}
          </div>
        </div>
      )}
      <label className="field">
        Qué comiste
        <input className="input" value={title} onChange={(e) => { setTitle(e.target.value); if (tpl && e.target.value !== tpl.title) setTemplateId(null) }} placeholder="ej. pollo con ensalada" data-testid="meal-title" />
      </label>
      <div className="grid2">
        <label className="field">
          Momento
          <select className="input" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
            {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">
          Hora
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="small" style={{ fontWeight: 600 }}>Porción</span>
        <div className="seg" role="group" aria-label="Porción">
          {PORTIONS.map((p) => <button key={p} aria-pressed={portion === p} onClick={() => setPortion(p)}>{p}</button>)}
        </div>
      </div>
      <label className="field">
        Calorías estimadas <span className="hint">Opcional. Vacío = sin estimación (no es lo mismo que 0).</span>
        <input className="input" inputMode="numeric" value={kcal} onChange={(e) => { setKcal(e.target.value); setKcalTouched(true) }} placeholder="sin estimación" />
        {tpl?.kcalNormal != null && !kcalTouched && <span className="hint">Sugerido desde “{tpl.title}” para porción {portion}.</span>}
      </label>
      <label className="row small" style={{ gap: 8 }}>
        <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} style={{ width: 22, height: 22 }} />
        Comida libre
      </label>
      <div className="row">
        {photoId && <PhotoImg id={photoId} alt="Foto de la comida" className="photo-thumb" />}
        <PhotoButton kind="meal" label={photoId ? 'Cambiar foto' : 'Foto (opcional)'} date={meal?.date ?? day} onSaved={(p) => setPhotoId(p.id)} />
        {photoId && <button className="linkbtn small" onClick={() => setPhotoId(null)}>Quitar</button>}
      </div>
      <label className="field">Nota <span className="hint">opcional</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {!meal && !templateId && title.trim() && (
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" checked={saveTpl} onChange={(e) => setSaveTpl(e.target.checked)} style={{ width: 22, height: 22 }} />
          Guardar como habitual
        </label>
      )}
      <button className="btn block" disabled={!valid} onClick={save} data-testid="meal-save">Guardar</button>
      {meal && (
        <button className="linkbtn small" style={{ color: 'var(--danger)', alignSelf: 'center' }} onClick={async () => {
          if (!confirm('¿Borrar esta comida?')) return
          const r = await persist(() => softDelete('meals', meal.id), 'Comida borrada')
          if (r.ok) onDone()
        }}>Borrar comida</button>
      )}
    </div>
  )
}

function guessSlot(hm: string): MealSlot {
  const h = Number(hm.slice(0, 2))
  if (h < 11) return 'desayuno'
  if (h < 15) return 'almuerzo'
  if (h < 19) return 'merienda'
  return 'cena'
}

function TemplatesEditor({ templates }: { templates: MealTemplate[] }) {
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>Las calorías son tu estimación para una porción normal; dejalas vacías si no sabés.</p>
      {templates.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)).map((t) => (
        <div key={t.id} className="card stack" style={{ gap: 8 }}>
          <input className="input" defaultValue={t.title} aria-label="Nombre" onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && persist(() => update<MealTemplate>('mealTemplates', t.id, { title: e.target.value.trim() }))} />
          <div className="grid2">
            <select className="input" defaultValue={t.slot} aria-label="Momento" onChange={(e) => persist(() => update<MealTemplate>('mealTemplates', t.id, { slot: e.target.value as MealSlot }))}>
              {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="input" inputMode="numeric" placeholder="kcal (opcional)" aria-label="kcal porción normal" defaultValue={t.kcalNormal ?? ''}
              onBlur={(e) => {
                const n = parseNum(e.target.value)
                const v = e.target.value.trim() === '' ? null : n != null && n >= 0 ? Math.round(n) : t.kcalNormal
                if (v !== t.kcalNormal) persist(() => update<MealTemplate>('mealTemplates', t.id, { kcalNormal: v }))
              }} />
          </div>
          <button className="linkbtn small" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => confirm(`¿Borrar "${t.title}"?`) && persist(() => softDelete('mealTemplates', t.id))}>Borrar</button>
        </div>
      ))}
      <button className="btn quiet" onClick={() => persist(() => insert<MealTemplate>('mealTemplates', { title: 'Nueva comida', slot: 'almuerzo', kcalNormal: null, notes: '' }))}>+ Agregar habitual</button>
    </div>
  )
}
