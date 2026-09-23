import { interviewProcessRepository } from '../repositories/interviewProcess.repository'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'
import type { SaveContactStatusDto, SaveRoundDto } from '../schemas/interviewProcess.schema'

const PRE_SCREENING_CODE = 'PRE_SCREENING'
const PRE_SCREENING_ACTIONS = new Set(['SHORTLISTED', 'REJECTED'])
const OTHER_ROUND_ACTIONS = new Set(['MOVE_TO_NEXT_ROUND', 'FINAL_SELECT', 'HOLD', 'REJECTED'])
const TERMINAL_ACTIONS = new Set(['FINAL_SELECT', 'REJECTED', 'HOLD'])

async function resolveCandidateRequisition(candidateId: number, companyId: number) {
  const requisition = await interviewProcessRepository.getCandidateRequisition(candidateId)
  if (!requisition) {
    throw new AppError('Candidate not found', 404)
  }
  if (requisition.companyId !== companyId) {
    throw new AppError('Candidate not found', 404)
  }
  return requisition
}

async function resolveRound(roundId: number, companyId: number) {
  const round = await interviewProcessRepository.getRoundById(roundId)
  if (!round || round.clientId !== companyId) {
    throw new AppError('Round not found', 404)
  }
  return round
}

export const interviewProcessService = {
  async getRounds(companyId: number) {
    return interviewProcessRepository.getRounds(companyId)
  },

  async getInterviewModes() {
    return interviewProcessRepository.getInterviewModes()
  },

  async getInterviewers() {
    return interviewProcessRepository.getInterviewers()
  },

  async getContactStatuses() {
    return interviewProcessRepository.getContactStatuses()
  },

  async getRoundActions() {
    return interviewProcessRepository.getRoundActions()
  },

  async getQuestions(params: { companyId: number; jdId: number; seniorityId: number; roundId: number; actionId: number }) {
    await resolveRound(params.roundId, params.companyId)
    return interviewProcessRepository.getQuestions(params)
  },

  async getCandidateRequisition(candidateId: number, companyId: number) {
    return resolveCandidateRequisition(candidateId, companyId)
  },

  async getCandidateHistory(candidateId: number, companyId: number) {
    await resolveCandidateRequisition(candidateId, companyId)
    const history = await interviewProcessRepository.getCandidateHistory(candidateId)
    if (!history) {
      throw new AppError('Candidate not found', 404)
    }
    return history
  },

  async saveContactStatus(candidateId: number, companyId: number, userId: number, dto: SaveContactStatusDto) {
    await resolveCandidateRequisition(candidateId, companyId)
    await resolveRound(dto.roundId, companyId)

    const contactStatus = await interviewProcessRepository.getContactStatusById(dto.contactStatusId)
    if (!contactStatus) {
      throw new AppError('Invalid contactStatusId', 400)
    }

    const transId = await interviewProcessRepository.saveContactStatus({
      candidateId,
      transId: dto.transId ?? null,
      roundId: dto.roundId,
      contactStatusId: dto.contactStatusId,
      createdBy: userId,
    })

    logger.info('Contact status saved', { candidateId, transId, roundId: dto.roundId, contactStatusId: dto.contactStatusId })

    return interviewProcessRepository.getCandidateHistory(candidateId)
  },

  async saveRound(candidateId: number, companyId: number, userId: number, dto: SaveRoundDto) {
    const requisition = await resolveCandidateRequisition(candidateId, companyId)
    const round = await resolveRound(dto.roundId, companyId)
    const isPreScreening = round.code === PRE_SCREENING_CODE

    const action = await interviewProcessRepository.getRoundActionById(dto.actionId)
    if (!action) {
      throw new AppError('Invalid actionId', 400)
    }

    const legalActions = isPreScreening ? PRE_SCREENING_ACTIONS : OTHER_ROUND_ACTIONS
    if (!legalActions.has(action.code)) {
      throw new AppError(
        isPreScreening
          ? `Action '${action.code}' is not valid for the Pre-Screening round. Use SHORTLISTED or REJECTED.`
          : `Action '${action.code}' is not valid for this round.`,
        400
      )
    }

    const questions = await interviewProcessRepository.getQuestions({
      companyId,
      jdId: requisition.jobTitleId,
      seniorityId: requisition.seniorityId,
      roundId: dto.roundId,
      actionId: dto.actionId,
    })

    const answersByMappingId = new Map(dto.answers.map((a) => [a.mappingId, a.answerText?.trim() ?? '']))
    const missing = questions.filter((q) => q.isRequired && !(answersByMappingId.get(q.mappingId) ?? '').length)
    if (missing.length > 0) {
      throw new AppError(
        `Required answer missing for: ${missing.map((q) => q.text).join(', ')}`,
        400
      )
    }

    const isTerminal = TERMINAL_ACTIONS.has(action.code)
    let nextRoundId: number | null = null
    let nextInterviewerIds: number[] | null = null
    let nextInterviewDatetime: Date | null = null
    let nextInterviewTypeId: number | null = null

    if (!isTerminal && dto.nextRound) {
      await resolveRound(dto.nextRound.roundId, companyId)
      nextRoundId = dto.nextRound.roundId
      nextInterviewerIds = dto.nextRound.interviewerIds
      nextInterviewDatetime = dto.nextRound.interviewDatetime ?? null
      nextInterviewTypeId = dto.nextRound.interviewTypeId ?? null
    }

    const transId = await interviewProcessRepository.saveRound({
      candidateId,
      roundId: dto.roundId,
      interviewerIds: dto.interviewerIds,
      interviewDatetime: isPreScreening ? null : dto.interviewDatetime ?? null,
      interviewTypeId: isPreScreening ? null : dto.interviewTypeId ?? null,
      actionId: dto.actionId,
      answers: dto.answers,
      nextRoundId,
      nextInterviewerIds,
      nextInterviewDatetime,
      nextInterviewTypeId,
      createdBy: userId,
    })

    logger.info('Round decision saved', { candidateId, transId, roundId: dto.roundId, actionId: dto.actionId })

    return interviewProcessRepository.getCandidateHistory(candidateId)
  },
}
