import path from 'path'
import {
  getSupabase,
  getSupabaseAnon,
  getSupabaseWithAccessToken,
} from '../lib/supabase.js'
import { AVATAR_ALLOWED } from '../lib/validation.js'

export async function getMyProfile(token) {
  if (!token) {
    return { status: 401, body: { error: 'No autorizado' } }
  }
  try {
    const supabase = getSupabaseWithAccessToken(token)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return { status: 401, body: { error: 'Token inválido' } }
    }
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, bio, avatar_url, banner_url')
      .eq('id', user.id)
      .single()
    if (error || !profile) {
      return { status: 404, body: { error: 'Perfil no encontrado' } }
    }
    return { status: 200, body: { profile } }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}

export async function getProfileByUsername(username) {
  if (!username) {
    return { status: 400, body: { error: 'Falta el usuario' } }
  }

  try {
    const supabase = getSupabaseAnon()

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(
        'id, username, display_name, bio, avatar_url, banner_url, created_at'
      )
      .eq('username', username.toLowerCase())
      .single()

    if (profileError || !profile) {
      return { status: 404, body: { error: 'Perfil no encontrado' } }
    }

    const { data: tweets, error: tweetsError } = await supabase
      .from('tweets')
      .select('id, content, created_at, author_id')
      .eq('author_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (tweetsError) {
      return { status: 500, body: { error: tweetsError.message } }
    }

    return { status: 200, body: { profile, tweets: tweets ?? [] } }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}

export async function patchMyProfile(token, body) {
  if (!token) {
    return { status: 401, body: { error: 'No autorizado' } }
  }

  const { display_name, bio } = body || {}
  if (display_name === undefined && bio === undefined) {
    return { status: 400, body: { error: 'Nada que actualizar' } }
  }

  try {
    const supabase = getSupabaseWithAccessToken(token)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return { status: 401, body: { error: 'Token inválido' } }
    }

    const updates = {}
    if (display_name !== undefined) {
      const dn = String(display_name).trim().slice(0, 80)
      if (!dn) {
        return { status: 400, body: { error: 'El nombre no puede estar vacío' } }
      }
      updates.display_name = dn
    }
    if (bio !== undefined) {
      const b = String(bio).trim().slice(0, 160)
      updates.bio = b
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select('id, username, display_name, bio, avatar_url, banner_url')
      .single()

    if (error) return { status: 400, body: { error: error.message } }
    return { status: 200, body: { profile: data } }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}

export async function uploadMyAvatar(token, file) {
  if (!token) {
    return { status: 401, body: { error: 'No autorizado' } }
  }
  if (!file) {
    return { status: 400, body: { error: 'Falta el archivo de imagen' } }
  }
  if (!AVATAR_ALLOWED.has(file.mimetype)) {
    return {
      status: 400,
      body: { error: 'Formato no permitido (jpeg, png, webp, gif)' },
    }
  }

  try {
    const supabaseUser = getSupabaseWithAccessToken(token)
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      return { status: 401, body: { error: 'Token inválido' } }
    }

    const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
    const fileName = `${user.id}${ext}`

    const supabaseAdmin = getSupabase()
    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      })

    if (uploadError) {
      return { status: 500, body: { error: uploadError.message } }
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('avatars')
      .getPublicUrl(fileName)

    const avatarUrl = urlData.publicUrl

    const { data: profile, error: updateError } = await supabaseUser
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id)
      .select('id, username, display_name, bio, avatar_url')
      .single()

    if (updateError) {
      return { status: 400, body: { error: updateError.message } }
    }

    return { status: 200, body: { profile } }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}
