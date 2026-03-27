import {
  getSupabaseAnon,
  getSupabaseWithAccessToken,
} from '../lib/supabase.js'

const TWEET_SELECT = `
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

export async function listTweets() {
  try {
    const supabase = getSupabaseAnon()
    const { data, error } = await supabase
      .from('tweets')
      .select(TWEET_SELECT)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return { status: 500, body: { error: error.message } }
    }

    return { status: 200, body: { tweets: data ?? [] } }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}

export async function createTweet(token, rawContent) {
  if (!token) {
    return { status: 401, body: { error: 'No autorizado' } }
  }

  const content = String(rawContent ?? '').trim()
  if (!content) {
    return { status: 400, body: { error: 'El contenido no puede estar vacío' } }
  }
  if (content.length > 280) {
    return { status: 400, body: { error: 'Máximo 280 caracteres' } }
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

    const { data, error } = await supabase
      .from('tweets')
      .insert({ author_id: user.id, content })
      .select(TWEET_SELECT)
      .single()

    if (error) {
      return { status: 400, body: { error: error.message } }
    }

    return { status: 201, body: { tweet: data } }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}
