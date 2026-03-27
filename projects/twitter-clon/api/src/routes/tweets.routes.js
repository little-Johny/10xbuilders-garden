import { Router } from 'express'
import { getBearerToken } from '../lib/bearer.js'
import * as tweetService from '../services/tweet.service.js'

const router = Router()

router.get('/', async (_req, res) => {
  const r = await tweetService.listTweets()
  res.status(r.status).json(r.body)
})

router.post('/', async (req, res) => {
  const token = getBearerToken(req)
  const r = await tweetService.createTweet(token, req.body?.content)
  res.status(r.status).json(r.body)
})

export default router
