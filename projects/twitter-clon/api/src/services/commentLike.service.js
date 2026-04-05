import { getSupabaseWithAccessToken } from '../lib/supabase.js'

export async function toggleCommentLike(token, commentId) {
  if (!token) {
    return { status: 401, body: { error: 'No autorizado' } }
  }
  if (!commentId) {
    return { status: 400, body: { error: 'commentId requerido' } }
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
      .from('comment_likes')
      .insert({ user_id: user.id, comment_id: commentId })

    if (insertError) {
      if (insertError.code === '23505') {
        const { error: deleteError } = await supabase
          .from('comment_likes')
          .delete()
          .eq('user_id', user.id)
          .eq('comment_id', commentId)

        if (deleteError) {
          return { status: 500, body: { error: deleteError.message } }
        }

        const count = await countLikes(supabase, commentId)
        return { status: 200, body: { liked: false, like_count: count } }
      }
      return { status: 400, body: { error: insertError.message } }
    }

    const count = await countLikes(supabase, commentId)
    return { status: 200, body: { liked: true, like_count: count } }
  } catch (e) {
    console.error(e)
    return { status: 500, body: { error: 'Error interno' } }
  }
}

async function countLikes(supabase, commentId) {
  const { count } = await supabase
    .from('comment_likes')
    .select('*', { count: 'exact', head: true })
    .eq('comment_id', commentId)
  return count ?? 0
}
