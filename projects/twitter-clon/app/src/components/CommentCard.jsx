import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'
import { useAuth } from '../contexts/AuthContext'

const MAX_DEPTH = 3

export function CommentCard({ comment, tweetId, depth = 0, onReply }) {
  const { session } = useAuth()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(comment.like_count ?? 0)
  const [liking, setLiking] = useState(false)
  const [replying, setReplying] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const p = Array.isArray(comment.profiles) ? comment.profiles[0] : comment.profiles
  const name = p?.display_name || p?.username || 'Usuario'
  const username = p?.username ?? null
  const handle = username ? `@${username}` : ''
  const avatarUrl = p?.avatar_url ?? null

  async function handleLike() {
    if (!session || liking) return
    setLiking(true)
    setLiked((prev) => !prev)
    setLikeCount((prev) => prev + (liked ? -1 : 1))

    try {
      const res = await fetch(
        `/api/tweets/${tweetId}/comments/${comment.id}/like`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      )
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setLiked(data.liked)
        setLikeCount(data.like_count)
      }
    } catch {
      setLiked((prev) => !prev)
      setLikeCount((prev) => prev + (liked ? 1 : -1))
    } finally {
      setLiking(false)
    }
  }

  async function handleSubmitReply(e) {
    e.preventDefault()
    const trimmed = replyContent.trim()
    if (!trimmed || !session || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/tweets/${tweetId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          content: trimmed,
          parent_comment_id: comment.id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setReplyContent('')
        setReplying(false)
        onReply?.(data.comment)
      }
    } catch {
      /* no-op */
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={depth > 0 ? 'ml-6 border-l border-xline pl-4' : ''}>
      <div className="flex gap-2.5 py-2">
        {username ? (
          <Link to={`/profile/${username}`} aria-label={`Perfil de ${name}`}>
            <Avatar src={avatarUrl} name={name} size="sm" />
          </Link>
        ) : (
          <Avatar src={avatarUrl} name={name} size="sm" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            {username ? (
              <Link
                to={`/profile/${username}`}
                className="text-[13px] font-bold text-x-text hover:underline"
              >
                {name}
              </Link>
            ) : (
              <span className="text-[13px] font-bold text-x-text">{name}</span>
            )}
            <span className="text-[13px] text-x-secondary">{handle}</span>
            <span className="text-[13px] text-x-secondary">·</span>
            <time className="text-[13px] text-x-secondary" dateTime={comment.created_at}>
              {comment.created_at
                ? new Date(comment.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })
                : ''}
            </time>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[14px] leading-[18px] text-x-text">
            {comment.content}
          </p>

          <div className="mt-1 flex items-center gap-4">
            <button
              type="button"
              onClick={handleLike}
              disabled={!session}
              className={`group flex items-center gap-1 transition ${
                liked ? 'text-pink-600' : 'text-x-secondary hover:text-pink-600'
              }`}
              aria-label={liked ? 'Quitar me gusta' : 'Me gusta'}
            >
              <span className="rounded-full p-1 transition group-hover:bg-pink-600/10">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                  {liked ? (
                    <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.45-4.92-.334-6.98C3.907 3.85 5.7 2.75 8.082 2.75c1.644 0 2.96.65 3.918 1.51.957-.86 2.274-1.51 3.918-1.51 2.382 0 4.175 1.1 5.301 3.46 1.116 2.06 1.026 4.48-.335 6.98z" />
                  ) : (
                    <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z" />
                  )}
                </svg>
              </span>
              {likeCount > 0 && (
                <span className="text-[12px]">{likeCount}</span>
              )}
            </button>

            {depth < MAX_DEPTH && session && (
              <button
                type="button"
                onClick={() => setReplying((r) => !r)}
                className="text-[12px] text-x-secondary transition hover:text-xblue"
              >
                Responder
              </button>
            )}
          </div>

          {replying && (
            <form onSubmit={handleSubmitReply} className="mt-2 flex gap-2">
              <input
                type="text"
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Escribe una respuesta…"
                maxLength={2000}
                className="x-input flex-1 py-1.5 text-[13px]"
              />
              <button
                type="submit"
                disabled={submitting || !replyContent.trim()}
                className="x-btn-primary px-3 py-1.5 text-[13px]"
              >
                {submitting ? '…' : 'Enviar'}
              </button>
            </form>
          )}
        </div>
      </div>

      {comment.replies?.map((reply) => (
        <CommentCard
          key={reply.id}
          comment={reply}
          tweetId={tweetId}
          depth={depth + 1}
          onReply={onReply}
        />
      ))}
    </div>
  )
}
