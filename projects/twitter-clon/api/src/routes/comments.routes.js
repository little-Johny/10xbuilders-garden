import { Router } from 'express'
import { getBearerToken } from '../lib/bearer.js'
import * as commentService from '../services/comment.service.js'
import * as commentLikeService from '../services/commentLike.service.js'

const router = Router({ mergeParams: true })

router.get('/', async (req, res) => {
  const r = await commentService.listComments(req.params.tweetId)
  res.status(r.status).json(r.body)
})

router.post('/', async (req, res) => {
  const token = getBearerToken(req)
  const r = await commentService.createComment(
    token,
    req.params.tweetId,
    req.body?.content,
    req.body?.parent_comment_id
  )
  res.status(r.status).json(r.body)
})

router.post('/:commentId/like', async (req, res) => {
  const token = getBearerToken(req)
  const r = await commentLikeService.toggleCommentLike(token, req.params.commentId)
  res.status(r.status).json(r.body)
})

export default router
