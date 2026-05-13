import { jdRepository } from '../repositories/jd.repository'
import { pythonClient, JdNextQuestionResponse, JdUpdateFieldRespondResponse, JdUpdateTextResponse } from '../clients/python.client'
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

// ── TESTING: hardcoded org DNA ────────────────────────────────────────────
// TODO: Remove this block and restore the DB fetch below once the Python API
//       is validated end-to-end against real profile data.
async function getCompanyOrgDna(
  _companyId: number
): Promise<Record<string, unknown>> {
  return {
    company_name: 'Mechsoft',
    industry_hint: 'IT',
    business_model: 'mixed',
    company_age_years_band: '30+',
    size_band: '26-50',
    geography: 'pune, mumbai',
    work_model: 'on-site',
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
  // ── RESTORE AFTER TESTING ──────────────────────────────────────────────────
  // const contextData: any = await jdRepository.getCompanyProfileContext(_companyId)
  // if (!contextData) {
  //   throw new AppError('Company profile context not found. Complete company profile first.', 404)
  // }
  // const orgDnaSnapshot =
  //   (contextData.org_dna_context?.org_dna_snapshot as Record<string, { value: unknown }>) || {}
  // const preparedOrgDna: Record<string, unknown> = {}
  // Object.keys(orgDnaSnapshot).forEach((key) => {
  //   preparedOrgDna[key] = orgDnaSnapshot[key].value
  // })
  // return preparedOrgDna
  // ───────────────────────────────────────────────────────────────────────────
}

export const jdService = {
  async startJdSession(
    companyId: number,
    userId: number
  ): Promise<{ sessionId: string; question: JdNextQuestionResponse }> {
    const preparedOrgDna = await getCompanyOrgDna(companyId)

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
    mode: string | null
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

    // For ORG_DNA_CONFIRMATION: use the confirmed answer from field_values[fieldKey]
    const resolvedAnswerValue =
      params.type === 'ORG_DNA_CONFIRMATION'
        ? String(answerResponse.field_values?.[params.fieldKey] ?? params.answer)
        : params.answer

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
      answerValue: resolvedAnswerValue,
      qaHistory: answerResponse ?? {},
      jdTheory: null,
      userId: params.userId,
      mode: params.mode,
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

  async getJdDetailsById(jdId: number) {
    const data = await jdRepository.getJdDetailsById(jdId)
    if (!data) {
      throw new AppError('JD not found', 404)
    }
    logger.info('JD details fetched', { jdId, status: data.statusName })
    return data
  },

  async generateWeightage(params: {
    jdId: number
    additionalNotes: string
    companyId: number
    userId: number
  }) {
    const jdDetails = await jdRepository.getJdDetailsById(params.jdId)
    if (!jdDetails) {
      throw new AppError('JD not found', 404)
    }

    const companyInfo = await getCompanyOrgDna(params.companyId)

    const weightsResponse = await pythonClient.generateWeights({
      jd_id: String(params.jdId),
      field_values: (jdDetails.fieldValues as Record<string, unknown>) ?? {},
      field_progress: (jdDetails.fieldProgress as Record<string, unknown>) ?? {},
      company_info: companyInfo,
      additional_notes: params.additionalNotes,
      created_by: String(params.userId),
    })

    // Convert capabilities object { key: {weight,required,...} } → array for DB
    const capabilitiesArray = Object.entries(weightsResponse.weights?.capabilities ?? {}).map(
      ([key, val]) => ({
        capability: key,
        weight: val.weight,
        required: val.required ?? [],
        optional: val.optional ?? [],
        description: val.description ?? '',
      })
    )

    const weightageId = await jdRepository.addUpdateJdWeightage({
      jdId: params.jdId,
      weightageJson: weightsResponse as unknown as Record<string, unknown>,
      capabilities: capabilitiesArray,
      userId: params.userId,
    })

    logger.info('JD weightage generated', { jdId: params.jdId, weightageId })
    return { weightageId, capabilities: capabilitiesArray }
  },

  async updateWeightage(params: {
    jdId: number
    userCommand: string
    companyId: number
    userId: number
  }) {
    const jdDetails = await jdRepository.getJdDetailsById(params.jdId)
    if (!jdDetails) {
      throw new AppError('JD not found', 404)
    }
    if (!jdDetails.weightageJson) {
      throw new AppError('No weightage found for this JD. Generate weightage first.', 400)
    }

    const companyInfo = await getCompanyOrgDna(params.companyId)

    const adjustResponse = await pythonClient.adjustWeights({
      jd_id: String(params.jdId),
      field_values: (jdDetails.fieldValues as Record<string, unknown>) ?? {},
      current_weights: jdDetails.weightageJson as Record<string, unknown>,
      company_info: companyInfo,
      user_command: params.userCommand,
      adjusted_by: String(params.userId),
    })

    const capabilitiesArray = Object.entries(adjustResponse.weights_payload?.capabilities ?? {}).map(
      ([key, val]) => ({
        capability: key,
        weight: val.weight,
        required: val.required ?? [],
        optional: val.optional ?? [],
        description: val.description ?? '',
      })
    )

    const weightageId = await jdRepository.addUpdateJdWeightage({
      jdId: params.jdId,
      weightageJson: { ...adjustResponse, weights: adjustResponse.weights_payload } as unknown as Record<string, unknown>,
      capabilities: capabilitiesArray,
      userId: params.userId,
    })

    logger.info('JD weightage updated', { jdId: params.jdId, weightageId })
    return { weightageId, capabilities: capabilitiesArray }
  },

  async deleteJd(params: { jdId: number; userId: number }): Promise<{ deleted: boolean; message: string }> {
    const deleted = await jdRepository.deleteJd(params)
    if (!deleted) {
      logger.info('JD delete blocked — used by candidate', { jdId: params.jdId })
      return { deleted: false, message: 'Not deleted, because already used for candidate.' }
    }
    logger.info('JD deleted', { jdId: params.jdId })
    return { deleted: true, message: 'JD deleted successfully.' }
  },

  async getAllJDs(companyId: number, jobTitleId?: number, seniorityId?: number) {
    const list = await jdRepository.getAllJDs({ companyId, jobTitleId, seniorityId })
    logger.info('JD list fetched', { companyId, count: list.length })
    return list
  },

  async updateTheory(params: {
    jdId: number
    editCommand: string
    userId: number
  }): Promise<JdUpdateTextResponse> {
    const jdDetails = await jdRepository.getJdDetailsById(params.jdId)
    if (!jdDetails) {
      throw new AppError('JD not found', 404)
    }
    if (!jdDetails.jdTheory) {
      throw new AppError('JD theory not found. Finalize the JD first.', 400)
    }

    const pythonResponse = await pythonClient.updateText({
      jd_id: String(params.jdId),
      field_values: (jdDetails.fieldValues as Record<string, unknown>) ?? {},
      edit_command: params.editCommand,
      rendered_text: jdDetails.jdTheory,
      edit_reason: '',
      edited_by: String(params.userId),
      conversation_mode: true,
      conversation_history: [],
    })

    await jdRepository.updateJdTheory({
      jdId: params.jdId,
      renderedText: pythonResponse.rendered_text,
      modifiedFields: pythonResponse.modified_fields ?? [],
      updatedFieldValues: pythonResponse.updated_field_values ?? {},
      userId: params.userId,
    })

    logger.info('JD theory updated', { jdId: params.jdId, modifiedFields: pythonResponse.modified_fields })
    return pythonResponse
  },

  async editQa(params: {
    jdId: number
    fieldKey: string
    answer: string
    companyId: number
    userId: number
  }): Promise<{
    updateContext: Record<string, unknown>
    step: string
    respondPayload: JdUpdateFieldRespondResponse
  }> {
    const jdDetails = await jdRepository.getJdDetailsById(params.jdId)
    if (!jdDetails) {
      throw new AppError('JD not found', 404)
    }

    const orgDna = await getCompanyOrgDna(params.companyId)

    const startResponse = await pythonClient.updateFieldStart({
      org_id: String(params.companyId),
      jd_id: String(params.jdId),
      user_id: String(params.userId),
      field_key: params.fieldKey,
      field_values: (jdDetails.fieldValues as Record<string, unknown>) ?? {},
      field_progress: (jdDetails.fieldProgress as Record<string, unknown>) ?? {},
      org_dna_snapshot: orgDna,
      skip_question: true,
    })

    const updateContext = startResponse.state.update_context

    const respondResponse = await pythonClient.updateFieldRespond({
      user_id: String(params.userId),
      update_context: updateContext,
      action: 'answer',
      answer: params.answer,
    })

    logger.info('JD edit_qa started', { jdId: params.jdId, fieldKey: params.fieldKey, step: respondResponse.step })
    return {
      updateContext: respondResponse.state.update_context,
      step: respondResponse.step,
      respondPayload: respondResponse,
    }
  },

  async updateQa(params: {
    answer: string
    userId: number
    updateContext: Record<string, unknown>
    step: string
    jdId: number
  }): Promise<{
    isCompleted: boolean
    updateContext: Record<string, unknown>
    step: string
    respondPayload: JdUpdateFieldRespondResponse
  }> {
    const action = params.step === 'final_confirm' ? 'confirm' : 'answer'

    const respondResponse = await pythonClient.updateFieldRespond({
      user_id: String(params.userId),
      update_context: params.updateContext,
      action,
      answer: params.answer,
    })

    if (respondResponse.completed) {
      const stateContext = respondResponse.state.update_context
      const fieldKey = stateContext?.target_field as string
      const newAnswer = (stateContext as any)?.answers?.new_value as string

      await jdRepository.editJdQaAnswer({
        jdId: params.jdId,
        fieldKey,
        newAnswer,
        userId: params.userId,
      })

      logger.info('JD QA answer updated', { jdId: params.jdId, fieldKey })
      return { isCompleted: true, updateContext: stateContext, step: respondResponse.step, respondPayload: respondResponse }
    }

    logger.info('JD update_qa progressing', { step: respondResponse.step })
    return {
      isCompleted: false,
      updateContext: respondResponse.state.update_context,
      step: respondResponse.step,
      respondPayload: respondResponse,
    }
  },
}
