import { AppError } from '@shared/middleware/errorHandler'
import logger from '@shared/logger/logger'
import { aiClient } from '../clients/ai.client'
import { companyProfileRepository } from '../repositories/companyProfile.repository'
import { commonService } from '@shared/services/common.service'
import type { QANextQuestion, QADataBlob, QAAnswerRequest } from '@shared/types/qa.types'

export const companyProfileService = {
  // ─── POST /start ─────────────────────────────────────────────────────────────
  async startProfile(
    userId: number,
    tenantId: number
  ): Promise<{ sessionId: string; nextQuestion: QANextQuestion; data: QADataBlob }> {
    const response = await aiClient.startSession(tenantId, userId)
    logger.info('Profile Q&A session started', { tenantId })
    return { sessionId: response.session_id, nextQuestion: response.next_question!, data: response.data }
  },

  // ─── POST /answer ─────────────────────────────────────────────────────────────
  async submitAnswer(params: {
    answer: string
    userId: number
    tenantId: number
    sessionId: string
    nextQuestion: QANextQuestion
    data: QADataBlob
  }): Promise<{
    isCompleted: boolean
    nextQuestion?: QANextQuestion
    data?: QADataBlob
  }> {
    const answerRequest: QAAnswerRequest = {
      session_id: params.sessionId,
      user_id: String(params.userId),
      field_key: params.nextQuestion.field_key,
      answer: params.answer,
      question_id: params.nextQuestion.question_id,
      data: params.data,
    }

    const aiResponse = await aiClient.submitAnswer(answerRequest)

    // Save current answer to DB
    await companyProfileRepository.upsertProfileQA(
      params.tenantId,
      params.nextQuestion.field_key,
      params.nextQuestion.text,
      [params.answer],
      params.userId,
      params.userId,
      params.nextQuestion.mode
    )

    // Handle resolved conflicts
    const resolvedConflicts = (aiResponse.data.conflict_context as any)?.resolved_conflict_ids as Array<Record<string, unknown>> | null | undefined
    if (resolvedConflicts && resolvedConflicts.length > 0) {
      logger.info('Resolving conflicts', { tenantId: params.tenantId, count: resolvedConflicts.length })
      for (const conflict of resolvedConflicts) {
        const fieldKey = Object.keys(conflict).find((k) => k !== 'conflict_id')
        if (!fieldKey) continue
        const resolvedValue = conflict[fieldKey]
        logger.info('Resolving conflict field', { tenantId: params.tenantId, fieldKey, resolvedValue })
        await companyProfileRepository.resolveConflictQA(
          params.tenantId,
          fieldKey,
          [String(resolvedValue)],
          params.userId
        )
      }
    }

    // Finalize if Q&A completed
    if (aiResponse.completed) {
      const orgDnaSnapshot = (aiResponse.data.org_dna_context as Record<string, unknown>)?.org_dna_snapshot as Record<string, unknown> ?? {}
      const simplifiedSnapshot = Object.fromEntries(
        Object.entries(orgDnaSnapshot).map(([key, field]) => {
          const f = field as Record<string, unknown>
          return [key, f.raw_answer ?? f.value ?? null]
        })
      )
      const finalizeResponse = await aiClient.finalizeProfile(params.tenantId, simplifiedSnapshot)

      await companyProfileRepository.addUpdateCompanyProfile(
        params.tenantId,
        params.nextQuestion.field_key,
        aiResponse.data as unknown as Record<string, unknown>,
        null,
        null,
        null,
        true,
        params.userId,
        params.userId,
        finalizeResponse.rendered_text
      )

      logger.info('Profile Q&A completed and theory saved', { tenantId: params.tenantId })
      return { isCompleted: true }
    }

    // Still in progress — persist session state and return next question
    await companyProfileRepository.addUpdateCompanyProfile(
      params.tenantId,
      aiResponse.next_question!.field_key,
      aiResponse.data as unknown as Record<string, unknown>,
      null,
      null,
      null,
      false,
      params.userId,
      params.userId,
      null
    )

    return { isCompleted: false, nextQuestion: aiResponse.next_question!, data: aiResponse.data }
  },

  // ─── GET /qa-for-edit ─────────────────────────────────────────────────────────
  async getQAForEdit(tenantId: number) {
    const header = await companyProfileRepository.getProfileHeader(tenantId)
    if (!header) return { header: null, next_question: null, qa_answers: [] }

    const qa = await companyProfileRepository.getProfileQA(tenantId)
    return { header, next_question: null, qa_answers: qa }
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
  async editQuestion(fieldKey: string, answer: string, userId: number, tenantId: number) {
    const session = await companyProfileRepository.getActiveChatSession(tenantId)
    if (!session) throw new AppError('No profile session found', 404)

    const savedContext = session.context_data as Record<string, unknown>
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
  async updateAnswer(
    answer: string,
    updateContext: Record<string, unknown>,
    step: string,
    userId: number,
    tenantId: number
  ) {
    const action = step === 'final_confirm' ? 'confirm' : 'answer'

    const aiResponse = await aiClient.respondToUpdate(userId, updateContext, action, answer)

    if (aiResponse.cancelled) {
      return { completed: false, cancelled: true, message: 'Update cancelled' }
    }

    if (!aiResponse.completed) {
      return {
        completed: false,
        cancelled: false,
        step: aiResponse.step,
        next_question: aiResponse.next_question,
        update_context: aiResponse.state.update_context,
      }
    }

    const updateCtx = aiResponse.state.update_context as Record<string, unknown>
    const updatedSnapshot = updateCtx.org_dna_snapshot as Record<string, unknown>
    const updatedFields = aiResponse.updated_fields ?? []
    const answersData = updateCtx.answers as Record<string, unknown>
    const newValue = answersData?.new_value ?? null
    const reason = (answersData?.reason as string) ?? 'Field updated'
    const impactedUpdates = (answersData?.impacted_updates as Record<string, unknown>) ?? {}

    const mappedChanges = updatedFields.map((fieldKey, index) => {
      if (index === 0) return { field_key: fieldKey, after: { value: newValue } }
      return { field_key: fieldKey, after: { value: impactedUpdates[fieldKey] ?? null } }
    })

    const session = await companyProfileRepository.getActiveChatSession(tenantId)
    if (!session) throw new AppError('No profile session found', 404)

    const savedCtx = session.context_data as Record<string, unknown>
    const finalContextData: Record<string, unknown> = {
      ...savedCtx,
      org_dna_context: {
        ...(savedCtx.org_dna_context as Record<string, unknown>),
        org_dna_snapshot: updatedSnapshot,
      },
    }

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
      null
    )

    logger.info('Answer updated', { tenantId, updatedFields })
    return { completed: true, cancelled: false, updated_fields: updatedFields }
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
