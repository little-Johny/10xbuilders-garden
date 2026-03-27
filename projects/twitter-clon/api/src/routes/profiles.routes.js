import { Router } from 'express'
import { getBearerToken } from '../lib/bearer.js'
import { uploadAvatar } from '../lib/upload.js'
import * as profileService from '../services/profile.service.js'

const router = Router()

router.get('/me', async (req, res) => {
  const r = await profileService.getMyProfile(getBearerToken(req))
  res.status(r.status).json(r.body)
})

router.patch('/me', async (req, res) => {
  const r = await profileService.patchMyProfile(getBearerToken(req), req.body)
  res.status(r.status).json(r.body)
})

router.post(
  '/me/avatar',
  uploadAvatar.single('avatar'),
  async (req, res) => {
    const r = await profileService.uploadMyAvatar(getBearerToken(req), req.file)
    res.status(r.status).json(r.body)
  }
)

router.get('/:username', async (req, res) => {
  const r = await profileService.getProfileByUsername(req.params.username)
  res.status(r.status).json(r.body)
})

export default router
