import { Router } from 'express'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { validate, validateParams } from '@shared/validators/validate'
import { chatAskSchema, chatReplySchema, chatSessionParamsSchema } from './schemas/chatAssistant.schema'
import { chatAssistantController } from './chatAssistant.controller'

const router = Router()

router.use(authMiddleware)

router.get('/sessions', chatAssistantController.getSessions)
router.get('/sessions/:sessionId/messages', validateParams(chatSessionParamsSchema), chatAssistantController.getMessages)
router.post('/ask', validate(chatAskSchema), chatAssistantController.ask)
router.post('/reply', validate(chatReplySchema), chatAssistantController.reply)

export default router
