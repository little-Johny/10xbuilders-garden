/**
 * Cliente Supabase — solo para uso en el backend (`api/`).
 * Variables: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (recomendado en servidor)
 * o SUPABASE_ANON_KEY solo en entornos de desarrollo acotados.
 */
import { createClient } from '@supabase/supabase-js'

export function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase no configurado: define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_ANON_KEY en dev)'
    )
  }

  return createClient(url, key)
}

/**
 * Cliente con clave anónima — Auth (signUp / signIn) e inserts bajo RLS con JWT de usuario.
 */
export function getSupabaseAnon() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Define SUPABASE_URL y SUPABASE_ANON_KEY para operaciones de usuario y Auth'
    )
  }

  return createClient(url, key)
}

/**
 * Cliente que envía el access_token del usuario; las políticas RLS ven auth.uid().
 */
export function getSupabaseWithAccessToken(accessToken) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Define SUPABASE_URL y SUPABASE_ANON_KEY para operaciones con JWT de usuario'
    )
  }

  return createClient(url, key, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
}
