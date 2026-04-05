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
  ),
  tweet_likes ( count ),
  comments ( count )
`

export async function listTweets(token) {
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

    let userId = null
    let authClient = null
    if (token) {
      authClient = getSupabaseWithAccessToken(token)
      const { data: { user } } = await authClient.auth.getUser()
      userId = user?.id ?? null
    }

    let likedSet = new Set()
    if (userId && data?.length) {
      const tweetIds = data.map((t) => t.id)
      const { data: likes } = await authClient
        .from('tweet_likes')
        .select('tweet_id')
        .eq('user_id', userId)
        .in('tweet_id', tweetIds)
      likedSet = new Set((likes ?? []).map((l) => l.tweet_id))
    }

    const tweets = (data ?? []).map((t) => normalizeTweet(t, likedSet))
    return { status: 200, body: { tweets } }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}

function normalizeTweet(t, likedSet) {
  return {
    id: t.id,
    content: t.content,
    created_at: t.created_at,
    author_id: t.author_id,
    profiles: t.profiles,
    like_count: t.tweet_likes?.[0]?.count ?? 0,
    comment_count: t.comments?.[0]?.count ?? 0,
    user_has_liked: likedSet.has(t.id),
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

    return { status: 201, body: { tweet: normalizeTweet(data, new Set()) } }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}
