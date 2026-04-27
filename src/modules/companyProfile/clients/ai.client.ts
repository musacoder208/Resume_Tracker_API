import axios from 'axios'
import { env } from '@shared/config/env'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

const AI_BASE = env.AI_SERVICE_URL

// ─── Shared sub-types ────────────────────────────────────────────────────────

export interface AIQuestionMeta {
  answer_type: string
  allowed_values: string[] | null
}

export interface AINextQuestion {
  text: string
  field_meta: AIQuestionMeta
}

export interface AIAttemptCounters {
  question_count_by_field: Record<string, unknown>
  exhausted_fields: Record<string, unknown>
  current_phase: string
  closing_question_asked: boolean
  closing_answer_captured: boolean
}

export interface AIQuestionContext {
  org_id: string
  interaction_id: string
  field_key: string
  question_type: string
  question_text: string
}

export interface AIState {
  signal_context: Record<string, unknown>
  org_dna_context: {
    org_id: string
    org_dna_snapshot: Record<string, OrgDnaField>
  }
  evidence_context: Record<string, unknown>
  conflict_context: Record<string, unknown>
  question_context: AIQuestionContext
  attempt_counters: AIAttemptCounters
}

export interface OrgDnaField {
  value: unknown
  resolved_values: unknown[] | null
  confidence: number
  state: string
  question: string | null
  raw_answer: unknown
  [key: string]: unknown
}

// ─── /start ──────────────────────────────────────────────────────────────────

export interface StartResponse {
  success: boolean
  completed: boolean
  session_id: string
  next_question: AINextQuestion
  state: AIState
}

// ─── /answer ─────────────────────────────────────────────────────────────────
// CRITICAL: state fields are spread as TOP-LEVEL keys — NOT nested under "state"

export interface AnswerRequest {
  session_id: string
  org_id: string
  user_id: string
  field_key: string
  answer: string
  signal_context: Record<string, unknown>
  org_dna_context: Record<string, unknown>
  evidence_context: Record<string, unknown>
  conflict_context: Record<string, unknown>
  question_context: Record<string, unknown>
  attempt_counters: Record<string, unknown>
}

export interface AnswerResponse {
  success: boolean
  completed: boolean
  next_question: AINextQuestion | null
  state: AIState
}

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
  audit_result?: {
    record: {
      target_field: string
      reason: string
      changes: Array<{
        field_key: string
        before: Record<string, unknown>
        after: Record<string, unknown>
      }>
    }
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

export const aiClient = {
  // POST /start — initialise a new Q&A session; no DB save happens here
  async startSession(orgId: number, userId: number): Promise<StartResponse> {
    try {
      const response = await axios.post<StartResponse>(`${AI_BASE}/start`, {
        org_id: String(orgId),
        user_id: String(userId),
        org_dna_context: {},
        evidence_context: {},
        conflict_context: {},
        attempt_counters: {},
      })
      logger.info('AI /start session initiated', { orgId, userId })
      return response.data
    } catch (error) {
      logger.error('AI /start failed', { error })
      throw new AppError('AI service unavailable', 503)
    }
  },

  // POST /answer — state fields are passed spread at top level by the service
  async submitAnswer(body: AnswerRequest): Promise<AnswerResponse> {
    try {
      const response = await axios.post<AnswerResponse>(`${AI_BASE}/answer`, body)
      logger.info('AI /answer received', { fieldKey: body.field_key })
      return response.data
    } catch (error) {
      logger.error('AI /answer failed', { error })
      throw new AppError('AI service unavailable', 503)
    }
  },

  // POST /update-field/start — org_dna_context comes from saved DB context_data
  async startUpdate(
    orgId: number,
    userId: number,
    fieldKey: string,
    orgDnaContext: Record<string, unknown>
  ): Promise<UpdateStartResponse> {
    try {
      const response = await axios.post<UpdateStartResponse>(`${AI_BASE}/update-field/start`, {
        org_id: String(orgId),
        user_id: String(userId),
        field_key: fieldKey,
        org_dna_context: orgDnaContext,
      })
      logger.info('AI /update-field/start received', { fieldKey })
      return response.data
    } catch (error) {
      logger.error('AI /update-field/start failed', { error })
      throw new AppError('AI service unavailable', 503)
    }
  },

  // POST /update-field/respond
  // action: "answer" during normal steps | "confirm" at final_confirm | "cancel" to abort
  async respondToUpdate(
    userId: number,
    updateContext: Record<string, unknown>,
    action: string,
    answer: string
  ): Promise<UpdateRespondResponse> {
    try {
      const response = await axios.post<UpdateRespondResponse>(`${AI_BASE}/update-field/respond`, {
        user_id: String(userId),
        update_context: updateContext,
        action,
        answer,
      })
      logger.info('AI /update-field/respond received', { action })
      return response.data
    } catch (error) {
      logger.error('AI /update-field/respond failed', { error })
      throw new AppError('AI service unavailable', 503)
    }
  },
}
