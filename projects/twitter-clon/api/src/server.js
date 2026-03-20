import express from 'express'
import cors from 'cors'

const app = express()
const PORT = Number(process.env.PORT) || 3001

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

app.listen(PORT, () => {
  console.log(`[api] http://localhost:${PORT} (health: /health)`)
})
