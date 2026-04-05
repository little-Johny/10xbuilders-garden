import { getSupabaseWithAccessToken } from '../lib/supabase.js'

export async function toggleLike(token, tweetId) {
  if (!token) {
    return { status: 401, body: { error: 'No autorizado' } }
  }
  if (!tweetId) {
    return { status: 400, body: { error: 'tweetId requerido' } }
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

    const { error: insertError } = await supabase
      .from('tweet_likes')
      .insert({ user_id: user.id, tweet_id: tweetId })

    if (insertError) {
      if (insertError.code === '23505') {
        const { error: deleteError } = await supabase
          .from('tweet_likes')
          .delete()
          .eq('user_id', user.id)
          .eq('tweet_id', tweetId)

        if (deleteError) {
          return { status: 500, body: { error: deleteError.message } }
        }

        const count = await countLikes(supabase, tweetId)
        return { status: 200, body: { liked: false, like_count: count } }
      }
      return { status: 400, body: { error: insertError.message } }
    }

    const count = await countLikes(supabase, tweetId)
    return { status: 200, body: { liked: true, like_count: count } }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}

async function countLikes(supabase, tweetId) {
  const { count } = await supabase
    .from('tweet_likes')
    .select('*', { count: 'exact', head: true })
    .eq('tweet_id', tweetId)
  return count ?? 0
}
