import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Solo claves públicas (URL + publishable/anon). La seguridad la dan las
// políticas RLS por usuario; nunca va una service_role key al navegador.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

export const isCloudConfigured = () => !!(url && key)

export function supabase(): SupabaseClient | null {
  if (!isCloudConfigured()) return null
  if (!client) {
    client = createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'lovely-fit-auth' },
    })
  }
  return client
}

export const PHOTO_BUCKET = 'fit-private'
