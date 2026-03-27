import { Router } from 'express'
import * as authService from '../services/auth.service.js'

const router = Router()

router.post('/register', async (req, res) => {
  const r = await authService.registerUser(req.body)
  res.status(r.status).json(r.body)
})

router.post('/login', async (req, res) => {
  const r = await authService.loginUser(req.body)
  res.status(r.status).json(r.body)
})

export default router
