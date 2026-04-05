import {
  getSupabaseAnon,
  getSupabaseWithAccessToken,
} from '../lib/supabase.js'

const COMMENT_SELECT = `
  id,
  tweet_id,
  author_id,
  parent_comment_id,
  content,
  created_at,
  profiles!comments_author_id_fkey (
    username,
    display_name,
    avatar_url
  ),
  comment_likes ( count )
`

export async function listComments(tweetId) {
  if (!tweetId) {
    return { status: 400, body: { error: 'tweetId requerido' } }
  }

  try {
    const supabase = getSupabaseAnon()
    const { data, error } = await supabase
      .from('comments')
      .select(COMMENT_SELECT)
      .eq('tweet_id', tweetId)
      .order('created_at', { ascending: true })

    if (error) {
      return { status: 500, body: { error: error.message } }
    }

    const comments = (data ?? []).map(normalizeComment)
    return { status: 200, body: { comments } }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}

export async function createComment(token, tweetId, rawContent, parentCommentId) {
  if (!token) {
    return { status: 401, body: { error: 'No autorizado' } }
  }
  if (!tweetId) {
    return { status: 400, body: { error: 'tweetId requerido' } }
  }

  const content = String(rawContent ?? '').trim()
  if (!content) {
    return { status: 400, body: { error: 'El contenido no puede estar vacío' } }
  }
  if (content.length > 2000) {
    return { status: 400, body: { error: 'Máximo 2000 caracteres' } }
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

    const row = {
      tweet_id: tweetId,
      author_id: user.id,
      content,
    }
    if (parentCommentId) {
      row.parent_comment_id = parentCommentId
    }

    const { data, error } = await supabase
      .from('comments')
      .insert(row)
      .select(COMMENT_SELECT)
      .single()

    if (error) {
      return { status: 400, body: { error: error.message } }
    }

    return { status: 201, body: { comment: normalizeComment(data) } }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}

function normalizeComment(c) {
  return {
    ...c,
    like_count: c.comment_likes?.[0]?.count ?? 0,
    comment_likes: undefined,
  }
}
