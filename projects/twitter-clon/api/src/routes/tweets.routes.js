import { Router } from 'express'
import { getBearerToken } from '../lib/bearer.js'
import * as tweetService from '../services/tweet.service.js'
import * as tweetLikeService from '../services/tweetLike.service.js'
import commentsRoutes from './comments.routes.js'

const router = Router()

router.use('/:tweetId/comments', commentsRoutes)

router.get('/', async (req, res) => {
  const token = getBearerToken(req)
  const r = await tweetService.listTweets(token)
  res.status(r.status).json(r.body)
})

router.post('/', async (req, res) => {
  const token = getBearerToken(req)
  const r = await tweetService.createTweet(token, req.body?.content)
  res.status(r.status).json(r.body)
})

router.post('/:tweetId/like', async (req, res) => {
  const token = getBearerToken(req)
  const r = await tweetLikeService.toggleLike(token, req.params.tweetId)
  res.status(r.status).json(r.body)
})

export default router
