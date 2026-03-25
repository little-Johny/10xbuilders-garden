import express from 'express'
import cors from 'cors'
import {
  getSupabaseAnon,
  getSupabaseWithAccessToken,
} from './lib/supabase.js'

const USERNAME_RE = /^[a-z0-9_]{3,30}$/

export function createApp() {
  const app = express()

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    })
  )
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'twitter-clon-api' })
  })

  app.post('/auth/register', async (req, res) => {
    const { email, password, username, display_name } = req.body || {}
    if (!email || !password || !username) {
      return res.status(400).json({
        error: 'Faltan email, contraseña o nombre de usuario',
      })
    }
    const u = String(username).trim().toLowerCase()
    if (!USERNAME_RE.test(u)) {
      return res.status(400).json({
        error:
          'El usuario debe tener 3-30 caracteres (minúsculas, números y guión bajo)',
      })
    }

    try {
      const supabase = getSupabaseAnon()
      const { data, error } = await supabase.auth.signUp({
        email: String(email).trim(),
        password: String(password),
      })
      if (error) {
        return res.status(400).json({ error: error.message })
      }
      if (!data.session || !data.user) {
        return res.status(500).json({ error: 'No se pudo crear la sesión' })
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
          return res
            .status(400)
            .json({ error: 'El nombre de usuario ya está en uso' })
        }
        return res.status(400).json({ error: profileError.message })
      }

      return res.json({
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
          expires_at: data.session.expires_at,
        },
        user: { id: data.user.id, email: data.user.email },
      })
    } catch (e) {
      console.error(e)
      return res.status(500).json({ error: 'Error interno' })
    }
  })

  app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({
        error: 'Faltan email o contraseña',
      })
    }

    try {
      const supabase = getSupabaseAnon()
      const { data, error } = await supabase.auth.signInWithPassword({
        email: String(email).trim(),
        password: String(password),
      })
      if (error) {
        return res.status(400).json({ error: error.message })
      }
      if (!data.session || !data.user) {
        return res.status(500).json({ error: 'No se pudo iniciar sesión' })
      }

      return res.json({
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
          expires_at: data.session.expires_at,
        },
        user: { id: data.user.id, email: data.user.email },
      })
    } catch (e) {
      console.error(e)
      return res.status(500).json({ error: 'Error interno' })
    }
  })

  app.get('/tweets', async (_req, res) => {
    try {
      const supabase = getSupabaseAnon()
      const { data, error } = await supabase
        .from('tweets')
        .select(
          `
          id,
          content,
          created_at,
          author_id,
          profiles!tweets_author_id_fkey (
            username,
            display_name,
            avatar_url
          )
        `
        )
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        return res.status(500).json({ error: error.message })
      }

      return res.json({ tweets: data ?? [] })
    } catch (e) {
      console.error(e)
      return res.status(500).json({ error: 'Error interno' })
    }
  })

  app.post('/tweets', async (req, res) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' })
    }
    const token = authHeader.slice('Bearer '.length).trim()
    if (!token) {
      return res.status(401).json({ error: 'No autorizado' })
    }

    const content = String(req.body?.content ?? '').trim()
    if (!content) {
      return res.status(400).json({ error: 'El contenido no puede estar vacío' })
    }
    if (content.length > 280) {
      return res.status(400).json({ error: 'Máximo 280 caracteres' })
    }

    try {
      const supabase = getSupabaseWithAccessToken(token)
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()
      if (userError || !user) {
        return res.status(401).json({ error: 'Token inválido' })
      }

      const { data, error } = await supabase
        .from('tweets')
        .insert({ author_id: user.id, content })
        .select(
          `
          id,
          content,
          created_at,
          author_id,
          profiles!tweets_author_id_fkey (
            username,
            display_name,
            avatar_url
          )
        `
        )
        .single()

      if (error) {
        return res.status(400).json({ error: error.message })
      }

      return res.status(201).json({ tweet: data })
    } catch (e) {
      console.error(e)
      return res.status(500).json({ error: 'Error interno' })
    }
  })

  return app
}
