import axios from 'axios'
import http from 'http'
import https from 'https'
import { env } from '@shared/config/env'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

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
  type: string
  // Normal question fields
  field_key: string
  mode: string
  can_be_skipped: boolean
  allowed_values: string[] | null
  // ORG_DNA_CONFIRMATION-specific fields
  org_dna_dimension: string   // acts as field_key for confirmation questions
  options: string[]           // acts as allowed_values for confirmation questions
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
  [key: string]: unknown
}

export interface JdOrgDnaConfirmationRequest {
  session_id: string
  question_id: string
  field_key: string
  confirmation_response: string
}

export interface JdOrgDnaConfirmationResponse {
  [key: string]: unknown
}

export interface JdFinalizeRequest {
  jd_id: string
  field_values: Record<string, unknown>
}

export interface JdFinalizeResponse {
  rendered_text: string
  [key: string]: unknown
}

export const pythonClient = {
  async initSession(body: JdSessionInitRequest): Promise<JdSessionInitResponse> {
    try {
      const response = await httpClient.post<JdSessionInitResponse>(
        `${PYTHON_BASE}/api/jd/session/init`,
        body
      )
      logger.info('Python JD /session/init called', { orgId: body.org_id })
      return response.data
    } catch (error) {
      logger.error('Python JD /session/init failed', { error })
      throw new AppError('Python service unavailable', 503)
    }
  },

  async getNextQuestion(sessionId: string): Promise<JdNextQuestionResponse> {
    try {
      const response = await httpClient.get<JdNextQuestionResponse>(
        `${PYTHON_BASE}/api/jd/next-question`,
        { params: { session_id: sessionId } }
      )
      logger.info('Python JD /next-question called', { sessionId })
      return response.data
    } catch (error) {
      logger.error('Python JD /next-question failed', { error })
      throw new AppError('Python service unavailable', 503)
    }
  },

  async submitAnswer(body: JdAnswerRequest): Promise<JdAnswerResponse> {
    try {
      const response = await httpClient.post<JdAnswerResponse>(
        `${PYTHON_BASE}/api/jd/answer`,
        body
      )
      logger.info('Python JD /answer submitted', {
        sessionId: body.session_id,
        questionId: body.question_id,
      })
      return response.data
    } catch (error) {
      logger.error('Python JD /answer failed', { error })
      throw new AppError('Python service unavailable', 503)
    }
  },

  async orgDnaConfirmation(body: JdOrgDnaConfirmationRequest): Promise<JdOrgDnaConfirmationResponse> {
    try {
      const response = await httpClient.post<JdOrgDnaConfirmationResponse>(
        `${PYTHON_BASE}/api/jd/org-dna-confirmation`,
        body
      )
      logger.info('Python JD /org-dna-confirmation submitted', { fieldKey: body.field_key })
      return response.data
    } catch (error) {
      logger.error('Python JD /org-dna-confirmation failed', { error })
      throw new AppError('Python service unavailable', 503)
    }
  },

  async finalizeJd(body: JdFinalizeRequest): Promise<JdFinalizeResponse> {
    try {
      const response = await httpClient.post<JdFinalizeResponse>(
        `${PYTHON_BASE}/api/jd/finalize`,
        body
      )
      logger.info('Python JD /finalize called', { jdId: body.jd_id })
      return response.data
    } catch (error) {
      logger.error('Python JD /finalize failed', { error })
      throw new AppError('Python service unavailable', 503)
    }
  },
}
