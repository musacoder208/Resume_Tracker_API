import { AppError } from '@shared/middleware/errorHandler'
import { chatAssistantRepository } from '../repositories/chatAssistant.repository'
import { chatPythonClient, type ChatPythonResponse } from '../clients/chatPython.client'
import type { ChatAskDto, ChatReplyDto } from '../schemas/chatAssistant.schema'

// No save logic here: Python saves every ask / reply itself. The service adds
// company_id + user_id from the login, forwards the call, and returns the
// response. History is read back with the read-only DB functions.

interface DbResult {
  success: boolean
  error_code?: string
  message?: string
  data?: unknown
}

export const chatAssistantService = {
  async getSessions(companyId: number, userId: number): Promise<unknown> {
    return chatAssistantRepository.getSessions(companyId, userId)
  },

  async getMessages(companyId: number, userId: number, sessionId: string): Promise<unknown> {
    const result = (await chatAssistantRepository.getMessages(companyId, userId, sessionId)) as DbResult | null
    if (result?.success !== true) {
      throw new AppError(result?.message ?? 'Chat not found', result?.error_code === 'NOT_FOUND' ? 404 : 400)
    }
    return result.data
  },

  async ask(companyId: number, userId: number, dto: ChatAskDto): Promise<ChatPythonResponse> {
    return chatPythonClient.ask({
      company_id: companyId,
      user_id: userId,
      session_id: dto.session_id ?? '', // "" = first question of a new chat; Python creates the session
      question: dto.question,
    })
  },

  async reply(companyId: number, userId: number, dto: ChatReplyDto): Promise<ChatPythonResponse> {
    return chatPythonClient.reply({
      company_id: companyId,
      user_id: userId,
      session_id: dto.session_id,
      question_id: dto.question_id,
      new_generated_question: dto.new_generated_question ?? '',
      selected: dto.selected ?? null, // null only for a clarify answer (Python contract)
      text: dto.text ?? '',
    })
  },
}
