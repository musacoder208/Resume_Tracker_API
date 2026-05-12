import { AppError } from '@shared/middleware/errorHandler'
import logger from '@shared/logger/logger'
import { aiClient, type AnswerRequest } from '../clients/ai.client'
import { companyProfileRepository } from '../repositories/companyProfile.repository'
import { commonService } from '@shared/services/common.service'

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
      const header = await companyProfileRepository.getProfileHeader(tenantId)
      if (header?.is_completed) throw new AppError('Profile Q&A is already completed', 400)
      contextData = existingSession.context_data as QAContextData
    }

    // Current question being answered — read from contextData before calling Python
    const currentQCtx = contextData.question_context as Record<string, unknown>
    const currentFieldKey = currentQCtx?.field_key as string ?? contextData.field_key
    const currentQuestionText = currentQCtx?.question_text as string ?? ''
    const currentQuestionType = currentQCtx?.question_type as string ?? 'initial'

    // Build /answer request
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

    const closingCaptured = aiResponse.completed === true
    const nextFieldKey = aiResponse.state?.question_context?.field_key ?? contextData.field_key

    // Build updated context_data to persist
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

    // Save current answer directly — one record per call (same as JD pattern)
    // mode = question_type: 'initial' | 'clarification' | 'crossfield'
    await companyProfileRepository.upsertProfileQA(
      tenantId,
      currentFieldKey,
      currentQuestionText,
      { value: answer },
      userId,
      userId,
      currentQuestionType
    )

    // Handle resolved conflicts — update tbl_profile_qa + audit for each resolved field
    // Each item: { conflict_id: "...", <field_key>: <answer_value> }
    const resolvedConflicts = aiResponse.resolved_conflict_ids
    if (resolvedConflicts && resolvedConflicts.length > 0) {
      logger.info('Resolving conflicts', { tenantId, count: resolvedConflicts.length })
      for (const conflict of resolvedConflicts) {
        const fieldKey = Object.keys(conflict).find((k) => k !== 'conflict_id')
        if (!fieldKey) continue
        const resolvedValue = conflict[fieldKey]
        logger.info('Resolving conflict field', { tenantId, fieldKey, resolvedValue })
        await companyProfileRepository.resolveConflictQA(tenantId, fieldKey, { value: resolvedValue }, userId)
      }
    }

    // Finalize if Q&A completed
    let theory: unknown = null
    if (closingCaptured) {
      const fullSnapshot = (aiResponse.state.org_dna_context?.org_dna_snapshot ?? {}) as Record<string, unknown>
      const simplifiedSnapshot = Object.fromEntries(
        Object.entries(fullSnapshot).map(([key, field]) => {
          const f = field as Record<string, unknown>
          return [key, f.raw_answer ?? f.value ?? null]
        })
      )
      const finalizeResponse = await aiClient.finalizeProfile(tenantId, simplifiedSnapshot)
      theory = finalizeResponse.theory
    }

    // Update header (create if first time) + upsert session + flip completed flag
    // p_qa_snapshot = null → skips snapshot loop in DB function
    await companyProfileRepository.addUpdateCompanyProfile(
      tenantId,
      nextFieldKey,
      newContextData as unknown as Record<string, unknown>,
      null,
      null,
      null,
      closingCaptured,
      userId,
      userId,
      theory
    )

    if (closingCaptured) {
      logger.info('Profile Q&A completed and theory updated', { tenantId })
      return { completed: true, message: 'Profile Q&A completed successfully' }
    }

    return {
      completed: false,
      next_question: aiResponse.next_question,
      state: aiResponse.state,
    }
  },

  // ─── GET /qa-for-edit ─────────────────────────────────────────────────────────
  async getQAForEdit(tenantId: number) {
    const header = await companyProfileRepository.getProfileHeader(tenantId)
    if (!header) return { header: null, next_question: null, qa_answers: [] }

    const session = await companyProfileRepository.getActiveChatSession(tenantId)
    const qa = await companyProfileRepository.getProfileQA(tenantId)

    const nextQuestion = session
      ? (session.context_data as QAContextData)?.question_context ?? null
      : null

    return { header, next_question: nextQuestion, qa_answers: qa }
  },

  // ─── GET /details ─────────────────────────────────────────────────────────────
  async getProfileDetails(tenantId: number) {
    return companyProfileRepository.getProfileDetails(tenantId)
  },

  // ─── GET /master-data ─────────────────────────────────────────────────────────
  async getMasterData() {
    return commonService.getMasterDataList()
  },

  // ─── GET /registration ────────────────────────────────────────────────────────
  async getCompanyRegistration(tenantId: number) {
    return commonService.getCompanyRegistrationDetails(tenantId)
  },

  // ─── PUT /registration ────────────────────────────────────────────────────────
  async updateCompanyRegistration(
    tenantId: number,
    userId: number,
    data: {
      company_name?: string
      company_email?: string
      company_phone?: string
      address?: string
      website?: string
      registration_number?: string
    }
  ) {
    return companyProfileRepository.updateCompanyRegistration(tenantId, data, userId)
  },

  // ─── GET /list ────────────────────────────────────────────────────────────────
  async getProfileList(tenantId: number) {
    return companyProfileRepository.getProfileList(tenantId)
  },

  // ─── POST /edit_question ──────────────────────────────────────────────────────
  // Calls Python /update-field/start then immediately /update-field/respond with
  // the user's new answer. Returns the next question (e.g. "why are you changing?")
  // ─── POST /edit_question ─────────────────────────────────────────────────────
  // Calls Python /update-field/start then immediately /update-field/respond with
  // the user's new answer. Returns update_context + step to client.
  async editQuestion(fieldKey: string, answer: string, userId: number, tenantId: number) {
    const session = await companyProfileRepository.getActiveChatSession(tenantId)
    if (!session) throw new AppError('No profile session found', 404)

    const savedContext = session.context_data as QAContextData
    const orgDnaContext = savedContext.org_dna_context as Record<string, unknown>

    const startResponse = await aiClient.startUpdate(tenantId, userId, fieldKey, orgDnaContext)
    if (startResponse.cancelled) throw new AppError('Update cancelled by AI', 400)

    const respondResponse = await aiClient.respondToUpdate(
      userId,
      startResponse.state.update_context,
      'answer',
      answer
    )

    logger.info('Edit question initiated', { tenantId, fieldKey, step: respondResponse.step })
    return {
      completed: respondResponse.completed,
      step: respondResponse.step,
      next_question: respondResponse.next_question,
      update_context: respondResponse.state.update_context,
    }
  },

  // ─── POST /update_answer ──────────────────────────────────────────────────────
  // Client sends back update_context + step from previous response.
  // step === 'final_confirm' → action switches to 'confirm' automatically.
  // Loops until completed === true, then saves to DB.
  async updateAnswer(answer: string, updateContext: Record<string, unknown>, step: string, userId: number, tenantId: number) {
    const action = step === 'final_confirm' ? 'confirm' : 'answer'

    const aiResponse = await aiClient.respondToUpdate(userId, updateContext, action, answer)

    if (aiResponse.cancelled) {
      return { completed: false, cancelled: true, message: 'Update cancelled' }
    }

    // Still in progress — return update_context + step for next call
    if (!aiResponse.completed) {
      return {
        completed: false,
        cancelled: false,
        step: aiResponse.step,
        next_question: aiResponse.next_question,
        update_context: aiResponse.state.update_context,
      }
    }

    // Step 4: Completed — update DB
    const updateCtx = aiResponse.state.update_context as Record<string, unknown>
    const updatedSnapshot = updateCtx.org_dna_snapshot as Record<string, unknown>
    const updatedFields = aiResponse.updated_fields ?? []
    const answersData = updateCtx.answers as Record<string, unknown>
    const newValue = answersData?.new_value ?? null
    const reason = answersData?.reason as string ?? 'Field updated'
    const impactedUpdates = (answersData?.impacted_updates as Record<string, unknown>) ?? {}

    const mappedChanges = updatedFields.map((fieldKey, index) => {
      if (index === 0) {
        return { field_key: fieldKey, after: { value: newValue } }
      }
      return { field_key: fieldKey, after: { value: impactedUpdates[fieldKey] ?? null } }
    })

    const session = await companyProfileRepository.getActiveChatSession(tenantId)
    if (!session) throw new AppError('No profile session found', 404)

    const savedCtx = session.context_data as QAContextData
    const finalContextData: Record<string, unknown> = {
      ...savedCtx,
      org_dna_context: {
        ...(savedCtx.org_dna_context as Record<string, unknown>),
        org_dna_snapshot: updatedSnapshot,
      },
    }

    // const simplifiedSnapshot = Object.fromEntries(
    //   Object.entries(updatedSnapshot).map(([key, field]) => {
    //     const f = field as Record<string, unknown>
    //     return [key, f.raw_answer ?? f.value ?? null]
    //   })
    // )
    // const finalizeResponse = await aiClient.finalizeProfile(tenantId, simplifiedSnapshot)

    await companyProfileRepository.addUpdateCompanyProfile(
      tenantId,
      session.field_key,
      finalContextData,
      null,
      mappedChanges,
      reason,
      false,
      userId,
      userId,
      null // finalizeResponse.theory — commented until finalizeProfile is stable
    )

    logger.info('Answer updated and theory refreshed', { tenantId, updatedFields })
    return {
      completed: true,
      cancelled: false,
      updated_fields: updatedFields,
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
