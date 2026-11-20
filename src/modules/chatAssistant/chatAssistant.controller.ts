import { Response, NextFunction } from 'express'
import { RequestWithUser } from '@shared/types/global.types'
import { sendSuccess } from '@shared/utils/response'
import { chatAssistantService } from './services/chatAssistant.service'
import type { ChatAskDto, ChatReplyDto, ChatSessionParamsDto } from './schemas/chatAssistant.schema'

// ask / reply return the Python response as-is (sql removed). Python's own
// errors (status "error" + error.code) come back as 200 so the UI shows them inline.

export const chatAssistantController = {
  async getSessions(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await chatAssistantService.getSessions(req.tenantId!, req.userId!)
      sendSuccess(res, { code: 'CHAT_SESSIONS_FETCHED', message: 'Chats fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getMessages(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params as unknown as ChatSessionParamsDto
      const data = await chatAssistantService.getMessages(req.tenantId!, req.userId!, sessionId)
      sendSuccess(res, { code: 'CHAT_MESSAGES_FETCHED', message: 'Chat fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async ask(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await chatAssistantService.ask(req.tenantId!, req.userId!, req.body as ChatAskDto)
      sendSuccess(res, { code: 'CHAT_ASK_DONE', message: 'Question processed', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async reply(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await chatAssistantService.reply(req.tenantId!, req.userId!, req.body as ChatReplyDto)
      sendSuccess(res, { code: 'CHAT_REPLY_DONE', message: 'Reply processed', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },
}
