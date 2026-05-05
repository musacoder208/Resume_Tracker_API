import { jdRepository } from '../repositories/jd.repository'
import { pythonClient, JdNextQuestionResponse } from '../clients/python.client'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

function parseExperience(
  answer: string,
  fieldKey: string
): { minExp: number | null; maxExp: number | null } {
  const lower = answer.toLowerCase()
  if (fieldKey !== 'experience' && !lower.includes('year')) {
    return { minExp: null, maxExp: null }
  }

  // "3 to 5 years"
  const rangeToMatch = answer.match(/(\d+)\s+to\s+(\d+)/i)
  if (rangeToMatch) {
    return { minExp: parseInt(rangeToMatch[1]), maxExp: parseInt(rangeToMatch[2]) }
  }

  // "3-5 years"
  const rangeDashMatch = answer.match(/(\d+)\s*-\s*(\d+)/)
  if (rangeDashMatch) {
    return { minExp: parseInt(rangeDashMatch[1]), maxExp: parseInt(rangeDashMatch[2]) }
  }

  // "5+ years"
  const plusMatch = answer.match(/(\d+)\+/)
  if (plusMatch) {
    return { minExp: parseInt(plusMatch[1]), maxExp: null }
  }

  // "3 years"
  const singleMatch = answer.match(/(\d+)/)
  if (singleMatch) {
    const val = parseInt(singleMatch[1])
    return { minExp: val, maxExp: val }
  }

  return { minExp: null, maxExp: null }
}

export const jdService = {
  async startJdSession(
    companyId: number,
    userId: number
  ): Promise<{ sessionId: string; question: JdNextQuestionResponse }> {
    const contextData = await jdRepository.getCompanyProfileContext(companyId)
    if (!contextData) {
      throw new AppError('Company profile context not found. Complete company profile first.', 404)
    }

    const orgDnaSnapshot = contextData.org_dna_snapshot as Record<
      string,
      { value: unknown }
    >
    const preparedOrgDna: Record<string, unknown> = {}
    Object.keys(orgDnaSnapshot).forEach((key) => {
      preparedOrgDna[key] = orgDnaSnapshot[key].value
    })

    const sessionResponse = await pythonClient.initSession({
      org_id: String(companyId),
      jd_id: '',
      session_id: '',
      org_dna_snapshot: preparedOrgDna,
      field_progress: {},
      field_values: {},
      question_counts: {},
      org_dna_override_annotations: {},
    })

    const sessionId = sessionResponse.session_id
    const question = await pythonClient.getNextQuestion(sessionId)

    logger.info('JD session started', { companyId, sessionId, userId })
    return { sessionId, question }
  },

  async submitJdAnswer(params: {
    answer: string
    jobTitleId: number
    seniorityId: number
    companyId: number
    userId: number
    sessionId: string
    questionId: string
    questionText: string
    fieldKey: string
    type: string
    jdId: number | null
  }): Promise<{
    jdId: number
    isFinalized: boolean
    nextQuestion?: JdNextQuestionResponse
  }> {
    const { minExp, maxExp } = parseExperience(params.answer, params.fieldKey)

    const answerResponse = await pythonClient.submitAnswer({
      session_id: params.sessionId,
      question_id: params.questionId,
      answer_payload: params.answer,
    })

    const jdId = await jdRepository.addUpdateJd({
      jdId: params.jdId,
      companyId: params.companyId,
      jobTitleId: params.jobTitleId,
      seniorityId: params.seniorityId,
      minExp,
      maxExp,
      sessionId: params.sessionId,
      fieldKey: params.fieldKey,
      questionText: params.questionText,
      answerValue: params.answer,
      qaHistory: answerResponse.qa_history ?? {},
      jdTheory: null,
      userId: params.userId,
    })

    if (params.type !== 'FINAL_QUESTION') {
      const nextQuestion = await pythonClient.getNextQuestion(params.sessionId)
      logger.info('JD answer submitted', { jdId, nextFieldKey: nextQuestion.field_key })
      return { jdId, isFinalized: false, nextQuestion }
    }

    // FINAL_QUESTION — finalize the JD
    const finalizeResponse = await pythonClient.finalizeJd({
      jd_id: String(jdId),
      field_values: answerResponse.field_values ?? {},
    })

    await jdRepository.finalizeJd({
      jdId,
      jdTheory: finalizeResponse.rendered_text,
      userId: params.userId,
    })

    logger.info('JD created successfully', { jdId, companyId: params.companyId })
    return { jdId, isFinalized: true }
  },
}
