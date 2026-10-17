'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useSyncStatus } from '@/lib/hooks'
import { supabase } from '@/lib/supabase'
import { IconBack } from '@/components/Icons'
import { showToast } from '@/components/ui'

interface Member { user_id: string; email: string; role: 'admin' | 'member'; status: 'active' | 'disabled'; plan: string; created_at: string }
interface Invite { email: string; role: 'admin' | 'member'; created_at: string; used_at: string | null }

/** Administración de accesos. El admin ve quién tiene acceso, nunca los datos de otros (RLS). */
export default function TeamPage() {
  const s = useSyncStatus()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const sb = supabase()
    if (!sb) return
    const [m, i] = await Promise.all([
      sb.from('fit_members').select('*').order('created_at'),
      sb.from('fit_invites').select('email, role, created_at, used_at').is('used_at', null).order('created_at'),
    ])
    if (m.error || i.error) return setError('No se pudo cargar. Revisá la conexión.')
    setError('')
    setMembers(m.data as Member[])
    setInvites(i.data as Invite[])
  }, [])

  useEffect(() => {
    if (s.membership?.role === 'admin') load()
  }, [s.membership?.role, load])

  if (s.membership?.role !== 'admin') {
    return (
      <div className="card stack">
        <h2>Solo para administradores</h2>
        <Link className="btn" href="/datos/">Volver</Link>
      </div>
    )
  }

  async function invite() {
    const clean = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return setError('Revisá el email.')
    const { error } = await supabase()!.from('fit_invites').insert({ email: clean, role })
    if (error) return setError(/duplicate|unique/i.test(error.message) ? 'Ese email ya tiene una invitación.' : 'No se pudo invitar.')
    setEmail('')
    showToast(`Invitación creada para ${clean}`)
    load()
  }

  async function setStatus(m: Member, status: Member['status']) {
    if (!confirm(status === 'disabled' ? `¿Pausar el acceso de ${m.email}? No podrá ver ni sincronizar sus datos hasta que lo reactives.` : `¿Reactivar a ${m.email}?`)) return
    const { error } = await supabase()!.from('fit_members').update({ status }).eq('user_id', m.user_id)
    if (error) return setError('No se pudo actualizar.')
    load()
  }

  async function revoke(i: Invite) {
    if (!confirm(`¿Cancelar la invitación de ${i.email}?`)) return
    const { error } = await supabase()!.from('fit_invites').delete().eq('email', i.email)
    if (error) return setError('No se pudo cancelar.')
    load()
  }

  const me = s.email?.toLowerCase()
  return (
    <div className="stack-lg">
      <Link href="/datos/" className="row small" style={{ textDecoration: 'none', gap: 4 }}><IconBack width={16} /> Ajustes</Link>
      <h1>Equipo y accesos</h1>
      <p className="small muted" style={{ margin: 0 }}>
        Acceso por invitación. Ves quién puede entrar, pero no los datos de nadie: cada cuenta solo ve lo suyo.
      </p>
      {error && <p className="small danger" role="alert" style={{ margin: 0 }}>{error}</p>}

      <section className="card stack">
        <h2>Invitar</h2>
        <label className="field">Email<input className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <div className="seg" role="group" aria-label="Rol">
          <button aria-pressed={role === 'member'} onClick={() => setRole('member')}>Miembro</button>
          <button aria-pressed={role === 'admin'} onClick={() => setRole('admin')}>Admin</button>
        </div>
        <button className="btn" onClick={invite}>Crear invitación</button>
        <p className="tiny muted" style={{ margin: 0 }}>La persona entra en la app con ese email y el código que le llega. No se envía ningún mail de invitación automático.</p>
      </section>

      {invites.length > 0 && (
        <section className="card stack">
          <h2>Invitaciones pendientes</h2>
          <div className="list">
            {invites.map((i) => (
              <div key={i.email} className="item">
                <div className="grow"><div className="ellipsis" style={{ fontWeight: 600 }}>{i.email}</div><div className="small muted">{i.role === 'admin' ? 'admin' : 'miembro'}</div></div>
                <button className="linkbtn small danger" onClick={() => revoke(i)}>Cancelar</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card stack">
        <h2>Miembros</h2>
        {members == null ? <p className="small muted">Cargando…</p> : (
          <div className="list">
            {members.map((m) => (
              <div key={m.user_id} className="item">
                <div className="grow">
                  <div className="ellipsis" style={{ fontWeight: 600 }}>{m.email}</div>
                  <div className="small muted">{m.role === 'admin' ? 'admin' : 'miembro'} · plan {m.plan} · {m.status === 'active' ? 'activo' : 'pausado'}</div>
                </div>
                {m.email.toLowerCase() !== me && (
                  m.status === 'active'
                    ? <button className="linkbtn small danger" onClick={() => setStatus(m, 'disabled')}>Pausar</button>
                    : <button className="linkbtn small" onClick={() => setStatus(m, 'active')}>Reactivar</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
