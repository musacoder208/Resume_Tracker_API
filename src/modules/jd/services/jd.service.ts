import { jdRepository } from '../repositories/jd.repository'
import { pythonClient, JdNextQuestionResponse } from '../clients/python.client'
import logger from '@shared/logger/logger'

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
    // ── TESTING: hardcoded org DNA ────────────────────────────────────────────
    // TODO: Remove this block and uncomment the DB fetch section below once
    //       the Python API is validated end-to-end against real profile data.
    const preparedOrgDna: Record<string, unknown> = {
      company_name: 'Mechsoft',
      industry_hint: 'IT',
      business_model: 'mixed',
      company_age_years_band: '30+',
      size_band: '26-50',
      geography: 'pune, mumbai',
      work_model: 'hybrid',
      attitude_vs_skill: 'balanced_only',
      must_have_traits: "['integrity', 'ownership_mindset', 'problem_solver', 'learning_agility']",
      learning_expectation: 'high',
      ownership_expectation: 'high',
      problem_solving_style: "['structured_process']",
      execution_style: 'depends_on_context',
      nice_to_have_traits:
        'problem_solving_skills, ownership_accountability, adaptability, continuous_learning_mindset, clear_communication, collaboration_effectively',
      baseline_requirement: 'very_important',
      collaboration_style: 'team_first',
      pressure_handling: 'mixed',
      ambiguity_level: 'medium',
      structure_level: 'high_process',
      anti_traits: "['rule_breaking', 'ego_driven', 'poor_learning_attitude']",
      pace: 'high',
    }
    // ── RESTORE AFTER TESTING ─────────────────────────────────────────────────
    // const contextData: any = await jdRepository.getCompanyProfileContext(companyId)
    // if (!contextData) {
    //   throw new AppError('Company profile context not found. Complete company profile first.', 404)
    // }
    // const orgDnaSnapshot =
    //   (contextData.org_dna_context?.org_dna_snapshot as Record<string, { value: unknown }>) || {}
    // const preparedOrgDna: Record<string, unknown> = {}
    // Object.keys(orgDnaSnapshot).forEach((key) => {
    //   preparedOrgDna[key] = orgDnaSnapshot[key].value
    // })
    // ─────────────────────────────────────────────────────────────────────────

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

  async submitOrgDnaConfirmation(params: {
    answer: string
    sessionId: string
    questionId: string
    fieldKey: string
  }): Promise<{ nextQuestion: JdNextQuestionResponse }> {
    await pythonClient.orgDnaConfirmation({
      session_id: params.sessionId,
      question_id: params.questionId,
      field_key: params.fieldKey,
      confirmation_response: params.answer,
    })

    const nextQuestion = await pythonClient.getNextQuestion(params.sessionId)
    logger.info('ORG_DNA_CONFIRMATION submitted', { fieldKey: params.fieldKey })
    return { nextQuestion }
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
      qaHistory: answerResponse ?? {},
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

  async getAllJDs(companyId: number, jobTitleId?: number, seniorityId?: number) {
    const list = await jdRepository.getAllJDs({ companyId, jobTitleId, seniorityId })
    logger.info('JD list fetched', { companyId, count: list.length })
    return list
  },
}
