'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSyncStatus } from '@/lib/hooks'
import { showToast } from './ui'

interface TokenStatus { active: boolean; created_at: string; last_used_at: string | null }

const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/fit_ingest_health`
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/** Conexión Salud → Lovely Fit con un Atajo diario y un token personal (solo escribe). */
export function HealthConnect() {
  const s = useSyncStatus()
  const [status, setStatus] = useState<TokenStatus | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!s.email) return
    supabase()?.rpc('fit_ingest_token_status').then(({ data }) => setStatus((data as TokenStatus) ?? null))
  }, [s.email, token])

  if (!s.email) return <p className="small muted" style={{ margin: 0 }}>Entrá con tu cuenta para conectar Salud.</p>

  async function generate() {
    if (status?.active && !confirm('Se genera un token nuevo y el anterior deja de funcionar. ¿Seguimos?')) return
    setBusy(true)
    const { data, error } = await supabase()!.rpc('fit_create_ingest_token')
    setBusy(false)
    if (error) return showToast('No se pudo generar el token. Revisá la conexión.', true)
    setToken(data as string)
  }

  async function revoke() {
    if (!confirm('¿Desconectar? El Atajo deja de poder enviar datos.')) return
    await supabase()!.rpc('fit_revoke_ingest_token')
    setToken(null)
    setStatus((st) => (st ? { ...st, active: false } : st))
    showToast('Conexión con Salud desactivada')
  }

  const copy = (text: string, what: string) =>
    navigator.clipboard?.writeText(text).then(() => showToast(`${what} copiado`), () => showToast('No se pudo copiar', true))

  const body = `{"p_token":"${token ?? 'TU_TOKEN'}","p_day":"(Fecha de ayer)","p_steps":(Pasos),"p_active_kcal":(Energía activa),"p_resting_hr":(FC en reposo),"p_workouts":[]}`

  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="small" style={{ margin: 0 }}>
        Estado: <strong>{status?.active ? 'conectado' : 'sin conectar'}</strong>
        {status?.last_used_at && <span className="muted"> · último envío {new Date(status.last_used_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>}
        {status?.active && !status.last_used_at && <span className="muted"> · todavía no llegó ningún envío</span>}
      </p>

      {token ? (
        <div className="card soft stack" style={{ gap: 8 }}>
          <p className="small" style={{ margin: 0 }}><strong>Tu token</strong> (se muestra una sola vez; solo sirve para enviar datos, no para leerlos):</p>
          <code className="tiny" style={{ wordBreak: 'break-all', userSelect: 'all' }} data-testid="ingest-token">{token}</code>
          <button className="btn sm" onClick={() => copy(token, 'Token')}>Copiar token</button>
        </div>
      ) : (
        <div className="row wrap">
          <button className="btn sm" disabled={busy} onClick={generate}>{status?.active ? 'Generar token nuevo' : 'Conectar Salud'}</button>
          {status?.active && <button className="btn sm quiet" onClick={revoke}>Desconectar</button>}
        </div>
      )}

      <details>
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>Cómo armar el Atajo (una sola vez, ~10 min)</summary>
        <ol className="small" style={{ paddingLeft: 18, display: 'grid', gap: 6 }}>
          <li>Primero mirá en Salud → Explorar qué datos manda GloryFitPro (pasos, frecuencia cardíaca, entrenamientos).</li>
          <li>En Atajos creá uno nuevo: <em>Fecha actual</em> → <em>Ajustar fecha</em> (restar 1 día) → <em>Formatear fecha</em> con formato personalizado <code>yyyy-MM-dd</code>.</li>
          <li><em>Buscar muestras de Salud</em>: Pasos, fecha «es ayer» → <em>Calcular estadísticas</em>: Suma.</li>
          <li>Repetí para <em>Energía activa</em> (Suma) y <em>Frecuencia cardíaca en reposo</em> (Promedio). Si alguna no existe, salteala.</li>
          <li><em>Obtener contenido de URL</em>: URL <button className="linkbtn tiny" onClick={() => copy(ENDPOINT, 'URL')}>copiar URL</button>, método <strong>POST</strong>.</li>
          <li>Encabezados: <code>apikey</code> = <button className="linkbtn tiny" onClick={() => copy(KEY, 'Clave pública')}>copiar clave pública</button> y <code>Content-Type</code> = <code>application/json</code>.</li>
          <li>Cuerpo JSON con estos campos (reemplazá lo que está entre paréntesis por las variables de los pasos anteriores):
            <code className="tiny" style={{ display: 'block', wordBreak: 'break-all', marginTop: 4 }}>{body}</code>
          </li>
          <li>En Automatización → Hora del día (ej. 7:30, cuando solés usar el teléfono) → este atajo → <strong>Ejecutar inmediatamente</strong>.</li>
        </ol>
        <p className="tiny muted">Con el iPhone bloqueado, Salud puede negar los datos y el envío falla; por eso conviene una hora en la que lo estés usando. Reenviar el mismo día actualiza, no duplica. Las rutas GPS no están disponibles por esta vía.</p>
      </details>
    </div>
  )
}
