import axios from 'axios'
import http from 'http'
import https from 'https'
import { env } from '@shared/config/env'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'
import type { QAStartRequest, QAAnswerRequest, QAResponse } from '@shared/types/qa.types'

const AI_BASE = env.AI_SERVICE_URL

const httpClient = axios.create({
  httpAgent: new http.Agent({ keepAlive: false }),
  httpsAgent: new https.Agent({ keepAlive: false }),
})

// Profile uses the standard QAResponse shape.
// resolved_conflict_ids lives inside data.conflict_context, not at the top level.
export type ProfileQAResponse = QAResponse

// ─── /update-field/start ─────────────────────────────────────────────────────

export interface UpdateStartResponse {
  success: boolean
  completed: boolean
  cancelled: boolean
  context_id: string
  step: string
  next_question: { text: string; field_key: string }
  state: {
    update_context: Record<string, unknown>
  }
}

// ─── /update-field/respond ───────────────────────────────────────────────────

export interface UpdateRespondResponse {
  success: boolean
  completed: boolean
  cancelled: boolean
  context_id: string
  step: string
  next_question: { text: string; field_key: string } | null
  state: {
    update_context: Record<string, unknown>
  }
  updated_fields?: string[]
}

// ─── /finalize ───────────────────────────────────────────────────────────────

export interface FinalizeResponse {
  success: boolean
  rendered_text: string
}

// ─── Client ──────────────────────────────────────────────────────────────────

export const aiClient = {
  // POST /api/org-dna/start
  // resumeData: pass context_data from DB to resume an existing session; omit for fresh start
  async startSession(orgId: number, userId: number, resumeData?: Record<string, unknown>): Promise<ProfileQAResponse> {
    const body: QAStartRequest = {
      id: String(orgId),
      org_id: String(orgId),
      user_id: String(userId),
      session_id: '',
      question_id: '',
      data: resumeData ? (resumeData as QAStartRequest['data']) : { org_dna_snapshot: {} },
    }
    try {
      const response = await httpClient.post<ProfileQAResponse>(
        `${AI_BASE}/api/org-dna/start`,
        body
      )
      logger.info('AI /org-dna/start called', { orgId, userId, resume: !!resumeData })
      return response.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('RAW AI ERROR /org-dna/start:', error.response?.status, JSON.stringify(error.response?.data))
      }
      logger.error('AI /org-dna/start failed', { error })
      throw new AppError('AI service unavailable', 503)
    }
  },

  // POST /api/org-dna/answer
  async submitAnswer(body: QAAnswerRequest): Promise<ProfileQAResponse> {
    try {
      const response = await httpClient.post<ProfileQAResponse>(
        `${AI_BASE}/api/org-dna/answer`,
        body
      )
      logger.info('AI /org-dna/answer submitted', { fieldKey: body.field_key })
      return response.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('RAW AI ERROR /org-dna/answer:', error.response?.status, JSON.stringify(error.response?.data))
      }
      logger.error('AI /org-dna/answer failed', { error })
      throw new AppError('AI service unavailable', 503)
    }
  },

  // POST /update-field/start
  async startUpdate(
    orgId: number,
    userId: number,
    fieldKey: string,
    contextData: Record<string, unknown>
  ): Promise<UpdateStartResponse> {
    try {
      const response = await httpClient.post<UpdateStartResponse>(
        `${AI_BASE}/api/org-dna/update-field/start`,
        {
          id: String(orgId),
          org_id: String(orgId),
          user_id: String(userId),
          field_key: fieldKey,
          data: contextData,
          skip_question: true,
        }
      )
      logger.info('AI /org-dna/update-field/start called', { fieldKey })
      return response.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('RAW AI ERROR /org-dna/update-field/start:', error.response?.status, JSON.stringify(error.response?.data))
      }
      logger.error('AI /org-dna/update-field/start failed', { error })
      throw new AppError('AI service unavailable', 503)
    }
  },

  // POST /update-field/respond
  async respondToUpdate(
    userId: number,
    updateContext: Record<string, unknown>,
    action: string,
    answer: string
  ): Promise<UpdateRespondResponse> {
    try {
      const response = await httpClient.post<UpdateRespondResponse>(
        `${AI_BASE}/api/org-dna/update-field/respond`,
        { user_id: String(userId), update_context: updateContext, action, answer }
      )
      logger.info('AI /org-dna/update-field/respond called', { action })
      return response.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('RAW AI ERROR /org-dna/update-field/respond:', error.response?.status, JSON.stringify(error.response?.data))
      }
      logger.error('AI /org-dna/update-field/respond failed', { error })
      throw new AppError('AI service unavailable', 503)
    }
  },

  // POST /finalize
  async finalizeProfile(orgId: number, orgDnaSnapshot: Record<string, unknown>): Promise<FinalizeResponse> {
    try {
      const response = await httpClient.post<FinalizeResponse>(
        `${AI_BASE}/api/org-dna/finalize`,
        { id: String(orgId), data: orgDnaSnapshot }
      )
      logger.info('AI /org-dna/finalize called', { orgId })
      return response.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('RAW AI ERROR /org-dna/finalize:', error.response?.status, JSON.stringify(error.response?.data))
      }
      logger.error('AI /org-dna/finalize failed', { error })
      throw new AppError('AI service unavailable', 503)
    }
  },
}
