import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.routes.js'
import tweetsRoutes from './routes/tweets.routes.js'
import profilesRoutes from './routes/profiles.routes.js'

export function createApp() {
  const app = express()

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    })
  )
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'twitter-clon-api' })
  })

  app.use('/auth', authRoutes)
  app.use('/tweets', tweetsRoutes)
  app.use('/profiles', profilesRoutes)

  return app
}
