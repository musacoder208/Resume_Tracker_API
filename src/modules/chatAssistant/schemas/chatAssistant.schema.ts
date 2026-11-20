import { z } from 'zod'

// No maximum length on questions / text — the UI has no character limit either.
// company_id and user_id are never accepted from the client — they come from the login.

// Empty / missing values are sent to Python as "" (never null) — see the service.
const optionalText = z.string().trim().nullable().optional()

export const chatAskSchema = z.object({
  session_id: optionalText,
  question: z.string().trim().min(1, 'Question is required'),
})

export const chatReplySchema = z.object({
  session_id: z.string().trim().min(1, 'session_id is required'),
  // question_id = tbl_chat_message.message_id; sent back to Python exactly as Python returned it
  question_id: z.union([
    z.number().int().positive(),
    z.string().trim().min(1, 'question_id is required'),
  ]),
  new_generated_question: optionalText,
  selected: optionalText,
  text: optionalText,
})

export const chatSessionParamsSchema = z.object({
  sessionId: z.string().trim().min(1, 'sessionId is required'),
})

export type ChatAskDto = z.infer<typeof chatAskSchema>
export type ChatReplyDto = z.infer<typeof chatReplySchema>
export type ChatSessionParamsDto = z.infer<typeof chatSessionParamsSchema>
