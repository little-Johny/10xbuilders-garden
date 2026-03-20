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
