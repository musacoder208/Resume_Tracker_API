import axios from 'axios'
import http from 'http'
import https from 'https'
import { env } from '@shared/config/env'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

// Python Chat API — Python saves every call itself (mechsoft.fn_chat_save_message).
// This client only forwards the request and returns the response.
const PYTHON_BASE = env.CHAT_PYTHON_API_URL ?? env.PYTHON_API_URL
const ASK_PATH = '/api/resume-tracker/ask'
const REPLY_PATH = '/api/resume-tracker/reply'

// Same as the JD Python client: a fresh TCP connection per call avoids ECONNRESET
const httpClient = axios.create({
  timeout: env.CHAT_PYTHON_TIMEOUT_MS,
  httpAgent: new http.Agent({ keepAlive: false }),
  httpsAgent: new https.Agent({ keepAlive: false }),
})

export interface ChatAskRequest {
  company_id: number
  user_id: number
  /** "" for the first question of a chat — Python creates the session */
  session_id: string
  question: string
}

export interface ChatReplyRequest {
  company_id: number
  user_id: number
  session_id: string
  /** tbl_chat_message.message_id — passed back exactly as Python returned it */
  question_id: number | string
  /** "" when the card was not a confirm */
  new_generated_question: string
  /** "yes" | "no" | option id | "all" | "cancel" | null (clarify) */
  selected: string | null
  /** "" when the user typed nothing (picked Yes or an option) */
  text: string
}

export type ChatResponseStatus =
  | 'answer'
  | 'confirm'
  | 'select'
  | 'clarify'
  | 'not_found'
  | 'refused'
  | 'limitation'
  | 'guide'
  | 'cancelled'
  | 'error'

/** Same shape for both APIs and every status */
export interface ChatPythonResponse {
  session_id: string | null
  /** tbl_chat_message.message_id created by fn_chat_save_message */
  question_id: number | string | null
  status: ChatResponseStatus
  needs_correction: boolean | null
  correction_reason: string | null
  original_question: string | null
  new_generated_question: string | null
  message: string
  assumptions: unknown[]
  notes: unknown[]
  options: Array<{ id: string; label: string }>
  result: {
    summary: string
    executed: boolean
    columns: unknown[]
    rows: unknown[]
    row_count: number
    truncated: boolean
    how_calculated: string
    sql?: string
  } | null
  error: { code: string; message: string } | null
  elapsed_ms: number
}

const isPythonResponse = (value: unknown): value is ChatPythonResponse =>
  typeof value === 'object' && value !== null && typeof (value as { status?: unknown }).status === 'string'

/** The generated SQL stays on the server — never sent to the browser */
const withoutSql = (response: ChatPythonResponse): ChatPythonResponse => {
  if (response.result == null) return response
  const { sql: _sql, ...result } = response.result
  return { ...response, result }
}

async function post(path: string, payload: ChatAskRequest | ChatReplyRequest): Promise<ChatPythonResponse> {
  try {
    logger.info('Chat Python call', { path, companyId: payload.company_id, userId: payload.user_id })
    const response = await httpClient.post<unknown>(`${PYTHON_BASE}${path}`, payload)
    if (!isPythonResponse(response.data)) throw new AppError('Invalid response from chat service', 502)
    return withoutSql(response.data)
  } catch (error) {
    if (error instanceof AppError) throw error

    // 404 / 409 / 410 / 422 come with the same response shape (error.code inside) —
    // return it so the UI can show the message instead of a generic failure.
    if (axios.isAxiosError(error) && error.response != null && error.response.status < 500) {
      const body: unknown = error.response.data
      if (isPythonResponse(body)) {
        logger.info('Chat Python returned an error response', { path, httpStatus: error.response.status, code: body.error?.code })
        return withoutSql(body)
      }
    }

    logger.error('Chat Python call failed', { path, error: error instanceof Error ? error.message : error })
    throw new AppError('Chat service unavailable', 503)
  }
}

export const chatPythonClient = {
  async ask(payload: ChatAskRequest): Promise<ChatPythonResponse> {
    return post(ASK_PATH, payload)
  },

  async reply(payload: ChatReplyRequest): Promise<ChatPythonResponse> {
    return post(REPLY_PATH, payload)
  },
}
