import { Router } from 'express'
import { authAdapter } from '@gateway/adapters/auth.adapter'

const router = Router()

router.get('/test', (_req, res) => {
  res.json({ message: 'gateway working' })
})

router.use('/auth', authAdapter)

export default router
