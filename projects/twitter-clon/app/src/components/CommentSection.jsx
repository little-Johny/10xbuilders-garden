import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { CommentCard } from './CommentCard'

export default function CommentSection({ tweetId }) {
  const { session } = useAuth()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/tweets/${tweetId}/comments`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setComments(buildTree(data.comments ?? []))
      }
    } catch {
      /* no-op */
    } finally {
      setLoading(false)
    }
  }, [tweetId])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  function handleNewComment(comment) {
    setComments((prev) => insertComment(prev, comment))
  }

  async function handlePost(e) {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed || !session || posting) return
    setPosting(true)
    try {
      const res = await fetch(`/api/tweets/${tweetId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setContent('')
        handleNewComment(data.comment)
      }
    } catch {
      /* no-op */
    } finally {
      setPosting(false)
    }
  }

  if (loading) {
    return (
      <p className="py-3 text-[13px] text-x-secondary">Cargando comentarios…</p>
    )
  }

  return (
    <div>
      {session && (
        <form onSubmit={handlePost} className="mb-2 flex gap-2">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escribe un comentario…"
            maxLength={2000}
            className="x-input flex-1 py-1.5 text-[13px]"
          />
          <button
            type="submit"
            disabled={posting || !content.trim()}
            className="x-btn-primary px-3 py-1.5 text-[13px]"
          >
            {posting ? '…' : 'Enviar'}
          </button>
        </form>
      )}

      {comments.length === 0 ? (
        <p className="py-2 text-[13px] text-x-secondary">
          Sin comentarios aún.
        </p>
      ) : (
        comments.map((c) => (
          <CommentCard
            key={c.id}
            comment={c}
            tweetId={tweetId}
            onReply={handleNewComment}
          />
        ))
      )}
    </div>
  )
}

function buildTree(flat) {
  const map = new Map()
  const roots = []
  for (const c of flat) {
    map.set(c.id, { ...c, replies: [] })
  }
  for (const c of flat) {
    const node = map.get(c.id)
    if (c.parent_comment_id && map.has(c.parent_comment_id)) {
      map.get(c.parent_comment_id).replies.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function insertComment(tree, comment) {
  const node = { ...comment, replies: [] }
  if (!comment.parent_comment_id) {
    return [...tree, node]
  }
  return tree.map((c) => insertIntoNode(c, node))
}

function insertIntoNode(current, node) {
  if (current.id === node.parent_comment_id) {
    return { ...current, replies: [...current.replies, node] }
  }
  if (current.replies.length > 0) {
    return {
      ...current,
      replies: current.replies.map((r) => insertIntoNode(r, node)),
    }
  }
  return current
}
