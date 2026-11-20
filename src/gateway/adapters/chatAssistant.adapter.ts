import { Router } from 'express'
import { env } from '@shared/config/env'
import { safeLoad } from '@gateway/utils/safeLoad'
import { chatAssistantProxy } from '@gateway/proxy/chatAssistant.proxy'

const router = Router()
router.use('/', env.MODE === 'monolith' ? safeLoad('chatAssistant') : chatAssistantProxy())

export const chatAssistantAdapter = router
