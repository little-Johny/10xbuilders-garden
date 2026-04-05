import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { BrandLogo } from '../components/BrandLogo'
import { TweetCard } from '../components/TweetCard'
import { useAuth } from '../contexts/AuthContext'

export default function FeedPage() {
  const { session, profile, ready, logout } = useAuth()
  const [tweets, setTweets] = useState([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [postError, setPostError] = useState('')
  const [posting, setPosting] = useState(false)

  const loadTweets = useCallback(async () => {
    const headers = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}
    const res = await fetch('/api/tweets', { headers })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setTweets([])
      return
    }
    setTweets(data.tweets ?? [])
  }, [session])

  useEffect(() => {
    if (!ready || !session) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      await loadTweets()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [ready, session, loadTweets])

  async function handlePost(e) {
    e.preventDefault()
    setPostError('')
    const trimmed = content.trim()
    if (!trimmed) return
    setPosting(true)
    try {
      const res = await fetch('/api/tweets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo publicar')
      }
      setContent('')
      await loadTweets()
    } catch (err) {
      setPostError(err.message)
    } finally {
      setPosting(false)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-x-black text-x-text flex items-center justify-center">
        <BrandLogo className="h-10 w-10 animate-pulse text-x-text" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen bg-x-black text-x-text">
      <header className="sticky top-0 z-20 border-b border-xline bg-x-black/80 backdrop-blur-md">
        <div className="mx-auto flex h-[53px] max-w-[600px] items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-7 w-7 shrink-0 text-x-text" />
            <h1 className="text-[20px] font-bold leading-none tracking-tight">
              Inicio
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {profile?.username && (
              <Link
                to={`/profile/${profile.username}`}
                aria-label="Mi perfil"
              >
                <Avatar
                  src={profile.avatar_url}
                  name={profile.display_name || profile.username}
                  size="sm"
                  className="ring-1 ring-xline hover:ring-x-secondary transition"
                />
              </Link>
            )}
            <button
              type="button"
              onClick={() => logout()}
              className="rounded-full border border-xline px-4 py-1.5 text-[13px] font-bold text-x-text transition hover:bg-x-hover"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-53px)] max-w-[600px] border-x border-xline">
        <form
          onSubmit={handlePost}
          className="border-b border-xline px-4 py-3"
        >
          <label htmlFor="tweet-content" className="sr-only">
            ¿Qué está pasando?
          </label>
          <div className="flex gap-3">
            {profile?.username ? (
              <Link to={`/profile/${profile.username}`} aria-label="Mi perfil">
                <Avatar
                  src={profile.avatar_url}
                  name={profile.display_name || profile.username}
                  size="md"
                />
              </Link>
            ) : (
              <div className="h-10 w-10 shrink-0 rounded-full bg-x-secondary/40" aria-hidden />
            )}
            <div className="min-w-0 flex-1 pt-1">
              <textarea
                id="tweet-content"
                rows={3}
                maxLength={280}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="¿Qué está pasando?"
                className="w-full resize-none bg-transparent text-xl leading-6 text-x-text placeholder-x-secondary outline-none focus:ring-0"
              />
              <div className="mt-3 flex items-center justify-between border-t border-xline pt-3">
                <span className="text-[13px] text-x-secondary">
                  {content.length}/280
                </span>
                <button
                  type="submit"
                  disabled={posting || !content.trim()}
                  className="x-btn-primary min-w-[76px] px-4 py-1.5 text-[15px] disabled:bg-x-secondary disabled:text-x-black/50"
                >
                  {posting ? '…' : 'Publicar'}
                </button>
              </div>
            </div>
          </div>
          {postError ? (
            <p className="mt-2 text-[15px] text-red-500" role="alert">
              {postError}
            </p>
          ) : null}
        </form>

        {loading ? (
          <p className="px-4 py-12 text-center text-[15px] text-x-secondary">
            Cargando publicaciones…
          </p>
        ) : tweets.length === 0 ? (
          <p className="px-4 py-12 text-center text-[15px] text-x-secondary">
            Aún no hay publicaciones. ¡Sé el primero!
          </p>
        ) : (
          <ul>
            {tweets.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
