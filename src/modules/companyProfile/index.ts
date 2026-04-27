import { Router } from 'express'
import companyProfileRoutes from './companyProfile.routes'

const router = Router()
router.use('/', companyProfileRoutes)

export default router
