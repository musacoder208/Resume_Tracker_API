import { Router } from 'express'
import { authAdapter } from '@gateway/adapters/auth.adapter'
import { companyProfileAdapter } from '@gateway/adapters/companyProfile.adapter'
import { jdAdapter } from '@gateway/adapters/jd.adapter'

const router = Router()

router.get('/test', (_req, res) => {
  res.json({ message: 'gateway working' })
})

router.use('/auth', authAdapter)
router.use('/companyProfile', companyProfileAdapter)
router.use('/jd', jdAdapter)

export default router
