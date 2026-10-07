import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { encryptedSessionStorage } from './sessionStorage'

let client: SupabaseClient | null | undefined

function readConfig(): { url: string; key: string } | null {
  const url = import.meta.env.MAIN_VITE_SUPABASE_URL
  const key = import.meta.env.MAIN_VITE_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) return null
  return { url, key }
}

export function isSupabaseConfigured(): boolean {
  return readConfig() !== null
}

/**
 * Returns the shared Supabase client, or null when MAIN_VITE_SUPABASE_URL /
 * MAIN_VITE_SUPABASE_PUBLISHABLE_KEY are not set. The app must keep working fully offline
 * against local SQLite when this returns null (transition period / no account configured).
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client

  const config = readConfig()
  if (!config) {
    console.log('[supabase] Not configured — running in local-only mode')
    client = null
    return client
  }

  client = createClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: encryptedSessionStorage,
    },
  })

  return client
}
