import { AppError } from '@shared/middleware/errorHandler'
import logger from '@shared/logger/logger'
import { aiClient, type AnswerRequest, type OrgDnaField } from '../clients/ai.client'
import { companyProfileRepository } from '../repositories/companyProfile.repository'

// ─── Shape stored in tbl_profile_ai_chat_session.context_data ────────────────
interface QAContextData {
  session_id: string
  org_id: string
  user_id: string
  field_key: string
  answer?: string
  signal_context: Record<string, unknown>
  org_dna_context: Record<string, unknown>
  evidence_context: Record<string, unknown>
  conflict_context: Record<string, unknown>
  question_context: Record<string, unknown>
  attempt_counters: Record<string, unknown>
  update_context?: Record<string, unknown> | null
}

export const companyProfileService = {
  // ─── POST /start ─────────────────────────────────────────────────────────────
  // Call Python /start and return to client. DO NOT save anything to DB here.
  async startProfile(userId: number, tenantId: number) {
    const aiResponse = await aiClient.startSession(tenantId, userId)
    logger.info('Profile Q&A initiated (no DB save on start)', { tenantId })
    return {
      session_id: aiResponse.session_id,
      next_question: aiResponse.next_question,
      state: aiResponse.state,
    }
  },

  // ─── POST /answer ─────────────────────────────────────────────────────────────
  async submitAnswer(answer: string, userId: number, tenantId: number) {
    const existingSession = await companyProfileRepository.getActiveChatSession(tenantId)
    let contextData: QAContextData

    if (!existingSession) {
      // No DB session yet — call /start to get initial state needed for /answer body
      const startResponse = await aiClient.startSession(tenantId, userId)
      contextData = {
        session_id: startResponse.session_id,
        org_id: String(tenantId),
        user_id: String(userId),
        field_key: startResponse.state.question_context.field_key,
        signal_context: startResponse.state.signal_context,
        org_dna_context: startResponse.state.org_dna_context as unknown as Record<string, unknown>,
        evidence_context: startResponse.state.evidence_context,
        conflict_context: startResponse.state.conflict_context,
        question_context: startResponse.state.question_context as unknown as Record<string, unknown>,
        attempt_counters: startResponse.state.attempt_counters as unknown as Record<string, unknown>,
      }
    } else {
      // Subsequent answers — rebuild request body from DB
      const header = await companyProfileRepository.getProfileHeader(tenantId)
      if (header?.is_completed) throw new AppError('Profile Q&A is already completed', 400)
      contextData = existingSession.context_data as QAContextData
    }

    // Build /answer request — state fields are SPREAD at top level (not nested)
    const answerRequest: AnswerRequest = {
      session_id: contextData.session_id,
      org_id: String(tenantId),
      user_id: String(userId),
      field_key: contextData.field_key,
      answer,
      signal_context: contextData.signal_context,
      org_dna_context: contextData.org_dna_context,
      evidence_context: contextData.evidence_context,
      conflict_context: contextData.conflict_context,
      question_context: contextData.question_context,
      attempt_counters: contextData.attempt_counters,
    }

    const aiResponse = await aiClient.submitAnswer(answerRequest)

    // ── Detect Q&A completion ─────────────────────────────────────────────────
    const closingCaptured = aiResponse.state?.attempt_counters?.closing_answer_captured === true
    const nextFieldKey = aiResponse.state?.question_context?.field_key ?? contextData.field_key

    // Build context_data to persist — includes answer for full traceability
    const newContextData: QAContextData = {
      session_id: contextData.session_id,
      org_id: String(tenantId),
      user_id: String(userId),
      field_key: nextFieldKey,
      answer,
      signal_context: aiResponse.state.signal_context,
      org_dna_context: aiResponse.state.org_dna_context as unknown as Record<string, unknown>,
      evidence_context: aiResponse.state.evidence_context,
      conflict_context: aiResponse.state.conflict_context,
      question_context: aiResponse.state.question_context as unknown as Record<string, unknown>,
      attempt_counters: aiResponse.state.attempt_counters as unknown as Record<string, unknown>,
    }

    // ── INSERT header once (idempotent — skipped if already exists) ──────────
    const existingHeader = await companyProfileRepository.getProfileHeader(tenantId)
    console.log(existingHeader,'exist header');
    if (!existingHeader || Object.keys(existingHeader).length === 0) {
      const statusId = await companyProfileRepository.getModuleStatusId('Company Profile', 'Approved')
      if (!statusId) throw new AppError('Status configuration missing for company_profile module', 500)
      await companyProfileRepository.createProfileHeader(tenantId, statusId, userId)
      logger.info('Profile header created', { tenantId })
    }

    // ── Always overwrite session context_data on every answer ─────────────────
    await companyProfileRepository.upsertChatSession(
      tenantId,
      nextFieldKey,
      newContextData as unknown as Record<string, unknown>,
      userId,
      userId
    )

    // ── Q&A complete: save snapshot + flip is_completed flag ──────────────────
    if (closingCaptured) {
      const snapshot = aiResponse.state.org_dna_context?.org_dna_snapshot ?? {}
      for (const [fieldKey, fieldData] of Object.entries(snapshot)) {
        const data = fieldData as OrgDnaField
        await companyProfileRepository.upsertProfileQA(
          tenantId,
          fieldKey,
          data.question ?? '',
          { value: data.raw_answer ?? null },
          userId,
          userId
        )
      }

      await companyProfileRepository.setProfileCompleted(tenantId, userId)
      logger.info('Profile Q&A completed', { tenantId })
      return { completed: true, message: 'Profile Q&A completed successfully' }
    }

    return {
      completed: false,
      next_question: aiResponse.next_question,
      state: aiResponse.state,
    }
  },

  // ─── GET /state ───────────────────────────────────────────────────────────────
  // Returns null header gracefully (profile not started yet)
  async getProfileState(tenantId: number) {
    const header = await companyProfileRepository.getProfileHeader(tenantId)
    if (!header) return { header: null, next_question: null, qa_answers: [] }

    const session = await companyProfileRepository.getActiveChatSession(tenantId)
    const qa = await companyProfileRepository.getProfileQA(tenantId)

    // Expose question_context so the landing page can resume the chat
    const nextQuestion = session
      ? (session.context_data as QAContextData)?.question_context ?? null
      : null

    return { header, next_question: nextQuestion, qa_answers: qa }
  },

  // ─── GET /list ────────────────────────────────────────────────────────────────
  async getProfileList(tenantId: number) {
    return companyProfileRepository.getProfileList(tenantId)
  },

  // ─── POST /update/start ───────────────────────────────────────────────────────
  async startUpdateField(fieldKey: string, userId: number, tenantId: number) {
    const header = await companyProfileRepository.getProfileHeader(tenantId)
    if (!header) throw new AppError('Profile not found', 404)
    if (!header.is_completed) {
      throw new AppError('Profile Q&A must be completed before updating fields', 400)
    }

    const existingQA = await companyProfileRepository.getProfileQAByFieldKey(tenantId, fieldKey)
    if (!existingQA) throw new AppError(`Field not found: ${fieldKey}`, 404)

    // org_dna_context comes from the saved Q&A chat_session context_data
    const session = await companyProfileRepository.getActiveChatSession(tenantId)
    if (!session) throw new AppError('No chat session found. Cannot start update.', 404)

    const savedContext = session.context_data as QAContextData
    const orgDnaContext = savedContext.org_dna_context as Record<string, unknown>

    const aiResponse = await aiClient.startUpdate(tenantId, userId, fieldKey, orgDnaContext)

    // Merge update_context into existing Q&A context (preserves org_dna_context for future updates)
    const newContextData: Record<string, unknown> = {
      ...savedContext,
      update_context: aiResponse.state.update_context,
    }
    await companyProfileRepository.upsertChatSession(tenantId, fieldKey, newContextData, userId, userId)

    logger.info('Profile field update started', { tenantId, fieldKey })
    return {
      completed: aiResponse.completed,
      cancelled: aiResponse.cancelled,
      context_id: aiResponse.context_id,
      step: aiResponse.step,
      next_question: aiResponse.next_question,
      state: aiResponse.state,
    }
  },

  // ─── POST /update/respond ─────────────────────────────────────────────────────
  async respondToUpdate(answer: string, userId: number, tenantId: number) {
    const header = await companyProfileRepository.getProfileHeader(tenantId)
    if (!header) throw new AppError('Profile not found', 404)

    const session = await companyProfileRepository.getActiveChatSession(tenantId)
    if (!session) throw new AppError('No active update session found', 404)

    const savedContext = session.context_data as QAContextData
    const updateContext = savedContext.update_context
    if (!updateContext) throw new AppError('No active update context. Call /update/start first.', 400)

    // Derive action from current step:
    //   "final_confirm" + answer "cancel" → cancel
    //   "final_confirm" + anything else   → confirm
    //   all other steps                   → answer
    const currentStep = (updateContext as Record<string, unknown>).current_step as string
    let action = 'answer'
    if (currentStep === 'final_confirm') {
      action = answer.toLowerCase() === 'cancel' ? 'cancel' : 'confirm'
    }

    const aiResponse = await aiClient.respondToUpdate(userId, updateContext, action, answer)

    // ── Cancelled: clear update_context, no data changes ─────────────────────
    if (aiResponse.cancelled) {
      const clearedContext: Record<string, unknown> = { ...savedContext, update_context: null }
      await companyProfileRepository.upsertChatSession(
        tenantId, session.field_key, clearedContext, userId, userId
      )
      logger.info('Profile field update cancelled', { tenantId })
      return { completed: false, cancelled: true, message: 'Update cancelled' }
    }

    // ── Still in progress: persist latest update_context ─────────────────────
    if (!aiResponse.completed) {
      const newContextData: Record<string, unknown> = {
        ...savedContext,
        update_context: aiResponse.state.update_context,
      }
      await companyProfileRepository.upsertChatSession(
        tenantId, session.field_key, newContextData, userId, userId
      )
      return {
        completed: false,
        cancelled: false,
        context_id: aiResponse.context_id,
        step: aiResponse.step,
        next_question: aiResponse.next_question,
        state: aiResponse.state,
      }
    }

    // ── Completed: atomic DB update (QA + audit + session) ────────────────────
    if (!aiResponse.audit_result) throw new AppError('Unexpected update response: missing audit_result', 500)

    const { target_field, changes, reason } = aiResponse.audit_result.record

    // Validate target field exists in changes
    const targetChange = changes.find((c) => c.field_key === target_field)
    if (!targetChange) throw new AppError(`Change record not found for field: ${target_field}`, 404)

    // Map changes to format expected by bulk update function
    const mappedChanges = changes.map((c) => ({
      field_key: c.field_key,
      after: { value: (c.after as Record<string, unknown>).value },
    }))

    // Rebuild context_data: update org_dna_snapshot with new values, clear update_context
    const updatedSnapshot =
      (aiResponse.state.update_context as Record<string, unknown>).org_dna_snapshot as Record<string, unknown>
    const finalContextData: Record<string, unknown> = {
      ...savedContext,
      org_dna_context: {
        ...(savedContext.org_dna_context as Record<string, unknown>),
        org_dna_snapshot: updatedSnapshot,
      },
      update_context: null,
    }

    // Single atomic DB call: update tbl_profile_qa + insert tbl_profile_qa_audit + update session
    await companyProfileRepository.bulkUpdateProfileWithAudit(
      tenantId,
      mappedChanges,
      reason,
      finalContextData,
      userId
    )

    logger.info('Profile field update completed', { tenantId, target_field })
    return {
      completed: true,
      cancelled: false,
      updated_fields: changes.map((c) => c.field_key),
    }
  },

  // ─── DELETE ───────────────────────────────────────────────────────────────────
  async deleteProfile(userId: number, tenantId: number) {
    const header = await companyProfileRepository.getProfileHeader(tenantId)
    if (!header) throw new AppError('Profile not found', 404)

    await companyProfileRepository.softDeleteProfile(tenantId, userId)
    logger.info('Profile soft deleted', { tenantId })
    return { deleted: true }
  },
}
