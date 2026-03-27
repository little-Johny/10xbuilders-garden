import {
  getSupabaseAnon,
} from '../lib/supabase.js'
import { USERNAME_RE } from '../lib/validation.js'

function sessionPayload(data) {
  return {
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      expires_at: data.session.expires_at,
    },
    user: { id: data.user.id, email: data.user.email },
  }
}

export async function registerUser(body) {
  const { email, password, username, display_name } = body || {}
  if (!email || !password || !username) {
    return {
      status: 400,
      body: { error: 'Faltan email, contraseña o nombre de usuario' },
    }
  }
  const u = String(username).trim().toLowerCase()
  if (!USERNAME_RE.test(u)) {
    return {
      status: 400,
      body: {
        error:
          'El usuario debe tener 3-30 caracteres (minúsculas, números y guión bajo)',
      },
    }
  }

  try {
    const supabase = getSupabaseAnon()
    const { data, error } = await supabase.auth.signUp({
      email: String(email).trim(),
      password: String(password),
    })
    if (error) {
      return { status: 400, body: { error: error.message } }
    }
    if (!data.session || !data.user) {
      return { status: 500, body: { error: 'No se pudo crear la sesión' } }
    }

    const displayName =
      display_name != null && String(display_name).trim() !== ''
        ? String(display_name).trim().slice(0, 80)
        : u

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      username: u,
      display_name: displayName,
    })

    if (profileError) {
      if (profileError.code === '23505') {
        return {
          status: 400,
          body: { error: 'El nombre de usuario ya está en uso' },
        }
      }
      return { status: 400, body: { error: profileError.message } }
    }

    return { status: 200, body: sessionPayload(data) }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}

export async function loginUser(body) {
  const { email, password } = body || {}
  if (!email || !password) {
    return {
      status: 400,
      body: { error: 'Faltan email o contraseña' },
    }
  }

  try {
    const supabase = getSupabaseAnon()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).trim(),
      password: String(password),
    })
    if (error) {
      return { status: 400, body: { error: error.message } }
    }
    if (!data.session || !data.user) {
      return { status: 500, body: { error: 'No se pudo iniciar sesión' } }
    }

    return { status: 200, body: sessionPayload(data) }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}
