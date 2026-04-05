import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'
import { useAuth } from '../contexts/AuthContext'

export function TweetCard({ tweet, onLikeToggled }) {
  const { session } = useAuth()
  const [liked, setLiked] = useState(tweet.user_has_liked ?? false)
  const [likeCount, setLikeCount] = useState(tweet.like_count ?? 0)
  const [liking, setLiking] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)

  const p = Array.isArray(tweet.profiles) ? tweet.profiles[0] : tweet.profiles
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
      const res = await fetch(`/api/tweets/${tweet.id}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setLiked(data.liked)
        setLikeCount(data.like_count)
        onLikeToggled?.(tweet.id, data)
      }
    } catch {
      setLiked((prev) => !prev)
      setLikeCount((prev) => prev + (liked ? 1 : -1))
    } finally {
      setLiking(false)
    }
  }

  return (
    <li className="border-b border-xline px-4 py-3 transition hover:bg-x-hover">
      <div className="flex gap-3">
        {username ? (
          <Link to={`/profile/${username}`} aria-label={`Perfil de ${name}`}>
            <Avatar src={avatarUrl} name={name} size="md" />
          </Link>
        ) : (
          <Avatar src={avatarUrl} name={name} size="md" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            {username ? (
              <Link
                to={`/profile/${username}`}
                className="truncate text-[15px] font-bold text-x-text hover:underline"
              >
                {name}
              </Link>
            ) : (
              <span className="truncate text-[15px] font-bold text-x-text">
                {name}
              </span>
            )}
            <span className="text-[15px] text-x-secondary">{handle}</span>
            <span className="text-[15px] text-x-secondary">·</span>
            <time
              className="text-[15px] text-x-secondary"
              dateTime={tweet.created_at || undefined}
            >
              {tweet.created_at
                ? new Date(tweet.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })
                : ''}
            </time>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-5 text-x-text">
            {tweet.content}
          </p>

          {/* Action bar */}
          <div className="mt-2 flex items-center gap-6">
            <button
              type="button"
              onClick={() => setCommentsOpen((o) => !o)}
              className="group flex items-center gap-1.5 text-x-secondary transition hover:text-xblue"
              aria-label="Comentarios"
            >
              <span className="rounded-full p-1.5 transition group-hover:bg-xblue/10">
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
                  <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z" />
                </svg>
              </span>
              {tweet.comment_count > 0 && (
                <span className="text-[13px]">{tweet.comment_count}</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleLike}
              disabled={!session}
              className={`group flex items-center gap-1.5 transition ${
                liked
                  ? 'text-pink-600'
                  : 'text-x-secondary hover:text-pink-600'
              }`}
              aria-label={liked ? 'Quitar me gusta' : 'Me gusta'}
            >
              <span className="rounded-full p-1.5 transition group-hover:bg-pink-600/10">
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
                  {liked ? (
                    <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.45-4.92-.334-6.98C3.907 3.85 5.7 2.75 8.082 2.75c1.644 0 2.96.65 3.918 1.51.957-.86 2.274-1.51 3.918-1.51 2.382 0 4.175 1.1 5.301 3.46 1.116 2.06 1.026 4.48-.335 6.98z" />
                  ) : (
                    <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z" />
                  )}
                </svg>
              </span>
              {likeCount > 0 && (
                <span className="text-[13px]">{likeCount}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {commentsOpen && (
        <div className="mt-2 ml-[52px]">
          <CommentSectionLazy tweetId={tweet.id} />
        </div>
      )}
    </li>
  )
}

import { lazy, Suspense } from 'react'
const CommentSectionModule = lazy(() => import('./CommentSection'))

function CommentSectionLazy({ tweetId }) {
  return (
    <Suspense
      fallback={
        <p className="py-3 text-[13px] text-x-secondary">Cargando comentarios…</p>
      }
    >
      <CommentSectionModule tweetId={tweetId} />
    </Suspense>
  )
}
