import { jdRepository } from '../repositories/jd.repository'
import { pythonClient, JdUpdateFieldRespondResponse, JdUpdateTextResponse } from '../clients/python.client'
import type { QANextQuestion, QADataBlob } from '@shared/types/qa.types'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

function normalizeAnswerValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return (value as unknown[]).join(',')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('min' in obj || 'max' in obj) {
      const min = obj.min
      const max = obj.max
      if (min != null && (max === null || max === undefined)) return `${min}+`
      if (min != null && max != null) return min === max ? `${min}` : `${min}-${max}`
      if (max != null) return `${max}`
    }
    return JSON.stringify(value)
  }
  return String(value)
}

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
    userId: number,
    jdId?: number,
    jdDetails?: any
  ): Promise<{ sessionId: string; nextQuestion: QANextQuestion; data: QADataBlob }> {
    let requestBody: import('@shared/types/qa.types').QAStartRequest

    if (jdId) {
      // const jdDetails = await jdRepository.getJdDetailsById(resume.jdId)
      // if (!jdDetails) throw new AppError('JD not found', 404)

      requestBody = {
        id: String(jdId),
        org_id: String(companyId),
        user_id: String(userId),
        session_id: jdDetails.sessionId ?? '',
        question_id: '',
        data: jdDetails ?? {},
      }
    } else {
      const orgDna = await getCompanyOrgDna(companyId)
      requestBody = {
        id: '1',
        org_id: String(companyId),
        user_id: String(userId),
        session_id: '',
        question_id: '',
        data: { org_dna_snapshot: orgDna },
      }
    }

    const response = await pythonClient.startJd(requestBody)

    //logger.info('JD session started', { companyId, sessionId: response.session_id, userId, resume: !!resume })
    return { sessionId: response.session_id, nextQuestion: response.next_question!, data: response.data }
  },

  async submitJdAnswer(params: {
    answer: string
    jobTitleId: number
    seniorityId: number
    companyId: number
    userId: number
    sessionId: string
    nextQuestion: QANextQuestion
    data: QADataBlob
    jdId: number | null
  }): Promise<{
    jdId: number
    isFinalized: boolean
    nextQuestion?: QANextQuestion
    data?: QADataBlob
    theory?: string
  }> {
    const { minExp, maxExp } = parseExperience(params.answer, params.nextQuestion.field_key)

    const answerResponse = await pythonClient.answerJd({
      session_id: params.sessionId,
      user_id: String(params.userId),
      field_key: params.nextQuestion.field_key,
      answer: params.answer,
      question_id: params.nextQuestion.question_id,
      data: params.data,
    })

    const jdId = await jdRepository.addUpdateJd({
      jdId: params.jdId,
      companyId: params.companyId,
      jobTitleId: params.jobTitleId,
      seniorityId: params.seniorityId,
      minExp,
      maxExp,
      sessionId: params.sessionId,
      fieldKey: params.nextQuestion.field_key,
      questionText: params.nextQuestion.text,
      answerValue: [params.answer],
      qaHistory: answerResponse.data as unknown as Record<string, unknown>,
      jdTheory: null,
      userId: params.userId,
      mode: params.nextQuestion.mode,
      workModel: params.nextQuestion.field_key === 'work_model' ? params.answer : null,
    })

    if (!answerResponse.completed) {
      logger.info('JD answer submitted', { jdId, nextFieldKey: answerResponse.next_question?.field_key })
      return { jdId, isFinalized: false, nextQuestion: answerResponse.next_question!, data: answerResponse.data }
    }

    // completed === true — JD creation finished
    // TODO: confirm with Python dev whether rendered_text comes in data when completed
    const finalizeResponse = await pythonClient.finalizeJd({
      id: String(jdId),
      data: {
        field_values: answerResponse.data.field_values ?? {},
      },
    })
    await jdRepository.finalizeJd({
      jdId,
      jdTheory: finalizeResponse.rendered_text,
      userId: params.userId,
    })

    logger.info('JD created successfully', { jdId, companyId: params.companyId })
    return { jdId, isFinalized: true, theory: finalizeResponse.rendered_text, data: answerResponse.data }
  },

  async getJdDetailsById(jdId: number) {
    const data = await jdRepository.getJdDetailsById(jdId)
    if (!data) throw new AppError('JD not found', 404)
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
      field_values: (jdDetails.dataBlob?.field_values as Record<string, unknown>) ?? {},
      field_progress: (jdDetails.dataBlob?.field_progress as Record<string, unknown>) ?? {},
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
    fieldValues: Record<string, unknown>
    currentWeights: Record<string, unknown>
    companyInfo: Record<string, unknown>
    userId: number
  }) {
    // const jdDetails = await jdRepository.getJdDetailsById(params.jdId)
    // if (!jdDetails) {
    //   throw new AppError('JD not found', 404)
    // }
    // if (!jdDetails.weightageJson) {
    //   throw new AppError('No weightage found for this JD. Generate weightage first.', 400)
    // }

    // const companyInfo = await getCompanyOrgDna(params.companyId)

    const adjustResponse = await pythonClient.adjustWeights({
      jd_id: String(params.jdId),
      field_values: params.fieldValues,
      current_weights: params.currentWeights,
      company_info: params.companyInfo,
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
    return {
      ...adjustResponse,
      jd_id: params.jdId,
      weightageId,
    }
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
    const [list, counts] = await Promise.all([
      jdRepository.getAllJDs({ companyId, jobTitleId, seniorityId }),
      jdRepository.getJdCounts(companyId),
    ])
    logger.info('JD list fetched', { companyId, count: list.length })
    return { counts, list }
  },

  async updateTheory(params: {
    jdId: number
    editCommand: string
    fieldValues: Record<string, unknown>
    renderedText: string
    userId: number
  }): Promise<JdUpdateTextResponse> {
    // const jdDetails = await jdRepository.getJdDetailsById(params.jdId)
    // if (!jdDetails) {
    //   throw new AppError('JD not found', 404)
    // }
    // if (!jdDetails.theory) {
    //   throw new AppError('JD theory not found. Finalize the JD first.', 400)
    // }

    const pythonResponse = await pythonClient.updateText({
      jd_id: String(params.jdId),
      field_values: params.fieldValues,
      edit_command: params.editCommand,
      rendered_text: params.renderedText,
      edit_reason: '',
      edited_by: String(params.userId),
      conversation_mode: true,
      conversation_history: [],
    })

    await jdRepository.saveJdEditTheory({
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
    fieldValues: Record<string, unknown>
    fieldProgress: Record<string, unknown>
    companyId: number
    userId: number
  }): Promise<{
    updateContext: Record<string, unknown>
    step: string
    respondPayload: JdUpdateFieldRespondResponse
  }> {
    const orgDna = await getCompanyOrgDna(params.companyId)

    const startResponse = await pythonClient.updateFieldStart({
      id: String(params.jdId),
      org_id: String(params.companyId),
      user_id: String(params.userId),
      field_key: params.fieldKey,
      data: {
        field_values: params.fieldValues,
        field_progress: params.fieldProgress,
        org_dna_snapshot: orgDna,
      },
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
      const updatedFields = (respondResponse.updated_fields ?? []) as string[]
      const fieldValues = (stateContext?.field_values ?? {}) as Record<string, unknown>

      for (const fieldKey of updatedFields) {
        const rawValue = fieldValues[fieldKey] ?? ''
        const displayValue = normalizeAnswerValue(rawValue)
        const answerArray = Array.isArray(rawValue)
          ? (rawValue as string[])
          : [displayValue]
        await jdRepository.editJdQaAnswer({
          jdId: params.jdId,
          fieldKey,
          newAnswer: answerArray,
          userId: params.userId,
        })
        await jdRepository.updateJdQaHistory({
          jdId: params.jdId,
          fieldKey,
          newValue: displayValue,
          userId: params.userId,
        })
      }

      logger.info('JD QA answer updated', { jdId: params.jdId, updatedFields })
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
