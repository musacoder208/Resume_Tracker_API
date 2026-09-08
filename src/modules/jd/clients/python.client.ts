import axios from 'axios'
import http from 'http'
import https from 'https'
import { env } from '@shared/config/env'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'
import type { QAStartRequest, QAAnswerRequest, QAResponse } from '@shared/types/qa.types'

const PYTHON_BASE = env.PYTHON_API_URL

// Disable keep-alive so each request opens a fresh TCP connection.
// Prevents ECONNRESET when the Python server closes the connection between calls.
const httpClient = axios.create({
  httpAgent: new http.Agent({ keepAlive: false }),
  httpsAgent: new https.Agent({ keepAlive: false }),
})

export interface JdSessionInitRequest {
  org_id: string
  jd_id: string
  session_id: string
  org_dna_snapshot: Record<string, unknown>
  field_progress: Record<string, unknown>
  field_values: Record<string, unknown>
  question_counts: Record<string, unknown>
  org_dna_override_annotations: Record<string, unknown>
}

export interface JdSessionInitResponse {
  session_id: string
  [key: string]: unknown
}

export interface JdNextQuestionResponse {
  question_id: string
  question_text: string
  field_key: string
  type: string
  mode: string
  can_be_skipped: boolean
  allowed_values: string[] | null
  [key: string]: unknown
}

export interface JdAnswerRequest {
  session_id: string
  question_id: string
  answer_payload: string
}

export interface JdAnswerResponse {
  qa_history: Record<string, unknown>
  field_values: Record<string, unknown>
  field_key?: string
  [key: string]: unknown
}

export interface JdFinalizeRequest {
  id: string
  org_id: string
  user_id: string
  data: {
    field_values: Record<string, unknown>
  }
}

export interface JdFinalizeResponse {
  rendered_text: string
  [key: string]: unknown
}

export interface JdWeightageCapabilityDetail {
  weight: number
  required: string[]
  optional: string[]
  description: string
}

export interface JdGenerateWeightsRequest {
  org_id: string
  field_values: Record<string, unknown>
  field_progress: Record<string, unknown>
  jd_id: string
  company_info: Record<string, unknown>
  additional_notes: string
  created_by: string
}

export interface JdAdjustWeightsRequest {
  org_id: string
  field_values: Record<string, unknown>
  jd_id: string
  user_command: string
  current_weights: Record<string, unknown>
  company_info: Record<string, unknown>
  adjusted_by: string
  force_override: boolean
  conversation_history: unknown[]
}

export interface JdWeightagePayload {
  capabilities: Record<string, JdWeightageCapabilityDetail>
  constraints: unknown[]
  total_weight: number
  role_title: string
  [key: string]: unknown
}

export interface JdGenerateWeightsResponse {
  success: boolean
  jd_id: string
  persisted: boolean
  weights: JdWeightagePayload
  confidence_aware_applied: boolean
  included_fields: string[]
  excluded_fields: string[]
  low_confidence_fields: string[]
  [key: string]: unknown
}

export interface JdAdjustWeightsResponse {
  success: boolean
  jd_id: string
  weights_updated: boolean
  response: string
  weights_payload: JdWeightagePayload
  [key: string]: unknown
}

export interface JdUpdateTextRequest {
  org_id: string
  jd_id: string
  field_values: Record<string, unknown>
  edit_command: string
  rendered_text: string
  edit_reason: string
  edited_by: string
  conversation_mode: boolean
  conversation_history: unknown[]
}

export interface JdUpdateTextResponse {
  rendered_text: string
  modified_fields: string[]
  updated_field_values: Record<string, unknown>
  [key: string]: unknown
}

export interface JdUpdateFieldStartRequest {
  id: string
  org_id: string
  user_id: string
  field_key: string
  data: {
    field_values: Record<string, unknown>
    field_progress: Record<string, unknown>
    org_dna_snapshot: Record<string, unknown>
  }
  skip_question: boolean
}

export interface JdUpdateFieldStartResponse {
  state: {
    update_context: Record<string, unknown>
    step: string
    next_question?: Record<string, unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface JdUpdateFieldRespondRequest {
  org_id: string
  user_id: string
  update_context: Record<string, unknown>
  action: 'answer' | 'confirm' | 'skip'
  answer?: string
}

export interface JdUpdateFieldRespondResponse {
  success: boolean
  completed: boolean
  cancelled: boolean
  context_id: string
  step: string
  next_question?: {
    text: string
    field_key: string
    [key: string]: unknown
  }
  state: {
    update_context: Record<string, unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

export const pythonClient = {
  // ── QA flow ────────────────────────────────────────────────────────────────

  async startJd(body: QAStartRequest): Promise<QAResponse> {
    try {
      const response = await httpClient.post<QAResponse>(`${PYTHON_BASE}/api/jd/start`, body)
      logger.info('Python JD /start called', { orgId: body.org_id })
      return response.data
    } catch (error) {
      logger.error('Python JD /start failed', { error })
      throw new AppError('Python service unavailable', 503)
    }
  },

  async answerJd(body: QAAnswerRequest): Promise<QAResponse> {
    try {
      const response = await httpClient.post<QAResponse>(`${PYTHON_BASE}/api/jd/answer`, body)
      logger.info('Python JD /answer submitted', {
        sessionId: body.session_id,
        questionId: body.question_id,
        fieldKey: body.field_key,
      })
      return response.data
    } catch (error) {
      logger.error('Python JD /answer failed', { error })
      throw new AppError('Python service unavailable', 503)
    }
  },

  // ── Old QA methods — replaced by startJd / answerJd above ─────────────────
  // async initSession(body: JdSessionInitRequest): Promise<JdSessionInitResponse> {
  //   const response = await httpClient.post(`${PYTHON_BASE}/api/jd/session/init`, body)
  //   return response.data
  // },
  //
  // async getNextQuestion(sessionId: string): Promise<JdNextQuestionResponse> {
  //   const response = await httpClient.get(`${PYTHON_BASE}/api/jd/next-question`, { params: { session_id: sessionId } })
  //   return response.data
  // },
  //
  // async submitAnswer(body: JdAnswerRequest): Promise<JdAnswerResponse> {
  //   const response = await httpClient.post(`${PYTHON_BASE}/api/jd/answer`, body)
  //   return response.data
  // },

  async adjustWeights(body: JdAdjustWeightsRequest): Promise<JdAdjustWeightsResponse> {
    try {
      console.log('=== adjustWeights REQUEST BODY ===')
      console.log(JSON.stringify(body, null, 2))
      console.log('==================================')
      const response = await httpClient.post<JdAdjustWeightsResponse>(
        `${PYTHON_BASE}/api/jd/adjust-weights`,
        body
      )
      logger.info('Python JD /adjust-weights called', { jdId: body.jd_id })
      return response.data
    } catch (error) {
      const axiosError = error as { response?: { data?: JdAdjustWeightsResponse } }
      if (axiosError.response?.data) {
        logger.warn('Python JD /adjust-weights returned error response', { data: axiosError.response.data })
        return axiosError.response.data
      }
      logger.error('Python JD /adjust-weights failed', { error })
      throw new AppError('Python service unavailable', 503)
    }
  },

  async generateWeights(body: JdGenerateWeightsRequest): Promise<JdGenerateWeightsResponse> {
    try {
      const response = await httpClient.post<JdGenerateWeightsResponse>(
        `${PYTHON_BASE}/api/jd/generate-weights`,
        body
      )
      logger.info('Python JD /generate-weights called', { jdId: body.jd_id })
      return response.data
    } catch (error) {
      logger.error('Python JD /generate-weights failed', { error })
      throw new AppError('Python service unavailable', 503)
    }
  },

  async updateText(body: JdUpdateTextRequest): Promise<JdUpdateTextResponse> {
    try {
      const response = await httpClient.post<JdUpdateTextResponse>(
        `${PYTHON_BASE}/api/jd/update-text`,
        body
      )
      logger.info('Python JD /update-text called', { jdId: body.jd_id })
      return response.data
    } catch (error) {
      logger.error('Python JD /update-text failed', { error })
      throw new AppError('Python service unavailable', 503)
    }
  },

  async updateFieldStart(body: JdUpdateFieldStartRequest): Promise<JdUpdateFieldStartResponse> {
    try {
      const response = await httpClient.post<JdUpdateFieldStartResponse>(
        `${PYTHON_BASE}/api/jd/update-field/start`,
        body
      )
      logger.info('Python JD /update-field/start called', { jdId: body.id, fieldKey: body.field_key })
      return response.data
    } catch (error) {
      logger.error('Python JD /update-field/start failed', { error })
      throw new AppError('Python service unavailable', 503)
    }
  },

  async updateFieldRespond(body: JdUpdateFieldRespondRequest): Promise<JdUpdateFieldRespondResponse> {
    try {
      const response = await httpClient.post<JdUpdateFieldRespondResponse>(
        `${PYTHON_BASE}/api/jd/update-field/respond`,
        body
      )
      logger.info('Python JD /update-field/respond called', { action: body.action })
      return response.data
    } catch (error) {
      logger.error('Python JD /update-field/respond failed', { error })
      throw new AppError('Python service unavailable', 503)
    }
  },

  async finalizeJd(body: JdFinalizeRequest): Promise<JdFinalizeResponse> {
    try {
      const response = await httpClient.post<JdFinalizeResponse>(
        `${PYTHON_BASE}/api/jd/finalize`,
        body
      )
      logger.info('Python JD /finalize called', { jdId: body.id })
      return response.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('RAW FINALIZE ERROR:', error.response?.status, JSON.stringify(error.response?.data))
      }
      logger.error('Python JD /finalize failed', { error })
      throw new AppError('Python service unavailable', 503)
    }
  },
}
