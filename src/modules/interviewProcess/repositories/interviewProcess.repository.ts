import { pool } from '@shared/config/db'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

export interface LookupRow {
  id: number
  name: string
  code: string
}

export interface CandidateRequisition {
  candidateId: number
  companyId: number
  jdId: number
  jobTitleId: number
  seniorityId: number
}

export interface QuestionRow {
  questionId: number
  mappingId: number
  text: string
  controlType: string
  isRequired: boolean
}

export interface InterviewerRow {
  empid: number
  empname: string
}

export const interviewProcessRepository = {
  async getRounds(companyId: number): Promise<LookupRow[]> {
    try {
      const result = await pool.query('SELECT * FROM public.fn_ip_get_rounds($1)', [companyId])
      return result.rows
    } catch (error) {
      logger.error('DB error in getRounds', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getRoundById(roundId: number): Promise<{ id: number; clientId: number; name: string; code: string } | null> {
    try {
      const result = await pool.query('SELECT * FROM public.fn_ip_get_round_by_id($1)', [roundId])
      const row = result.rows[0]
      if (!row) return null
      return { id: Number(row.id ?? 0), clientId: Number(row.client_id ?? 0), name: row.name, code: row.code }
    } catch (error) {
      logger.error('DB error in getRoundById', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getInterviewModes(): Promise<LookupRow[]> {
    try {
      const result = await pool.query('SELECT * FROM public.fn_ip_get_interview_modes()')
      return result.rows
    } catch (error) {
      logger.error('DB error in getInterviewModes', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getContactStatuses(): Promise<LookupRow[]> {
    try {
      const result = await pool.query('SELECT * FROM public.fn_ip_get_contact_statuses()')
      return result.rows
    } catch (error) {
      logger.error('DB error in getContactStatuses', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getContactStatusById(contactStatusId: number): Promise<LookupRow | null> {
    try {
      const result = await pool.query('SELECT * FROM public.fn_ip_get_contact_status_by_id($1)', [contactStatusId])
      return result.rows[0] ?? null
    } catch (error) {
      logger.error('DB error in getContactStatusById', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getRoundActions(): Promise<LookupRow[]> {
    try {
      const result = await pool.query('SELECT * FROM public.fn_ip_get_round_actions()')
      return result.rows
    } catch (error) {
      logger.error('DB error in getRoundActions', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getInterviewers(): Promise<InterviewerRow[]> {
    try {
      const result = await pool.query('SELECT * FROM public.fn_ip_get_interviewers()')
      return result.rows
    } catch (error) {
      logger.error('DB error in getInterviewers', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getRoundActionById(actionId: number): Promise<LookupRow | null> {
    try {
      const result = await pool.query('SELECT * FROM public.fn_ip_get_round_action_by_id($1)', [actionId])
      return result.rows[0] ?? null
    } catch (error) {
      logger.error('DB error in getRoundActionById', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getCandidateRequisition(candidateId: number): Promise<CandidateRequisition | null> {
    try {
      const result = await pool.query('SELECT * FROM mechsoft.fn_ip_get_candidate_requisition($1)', [candidateId])
      const row = result.rows[0]
      if (!row) return null
      return {
        candidateId: Number(row.candidate_id ?? 0),
        companyId: Number(row.company_id?? 0),
        jdId: Number(row.jd_id?? 0),
        jobTitleId: Number(row.job_title_id ?? 0),
        seniorityId: Number(row.seniority_id?? 0),
      }
    } catch (error) {
      logger.error('DB error in getCandidateRequisition', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getQuestions(params: {
    companyId: number
    jdId: number
    seniorityId: number
    roundId: number
    actionId: number
  }): Promise<QuestionRow[]> {
    try {
      const result = await pool.query('SELECT * FROM mechsoft.fn_ip_get_questions($1, $2, $3, $4, $5)', [
        params.companyId,
        params.jdId,
        params.seniorityId,
        params.roundId,
        params.actionId,
      ])
      return result.rows.map((row) => ({
        questionId: row.question_id,
        mappingId: row.mapping_id,
        text: row.text,
        controlType: row.control_type,
        isRequired: row.is_required,
      }))
    } catch (error) {
      const msg = (error as Error).message
      logger.error('DB error in getQuestions', { message: msg, error })
      throw new AppError(`Database error: ${msg}`, 500)
    }
  },

  async saveContactStatus(params: {
    candidateId: number
    transId: number | null
    roundId: number
    contactStatusId: number
    createdBy: number
  }): Promise<number> {
    try {
      const result = await pool.query('SELECT mechsoft.fn_ip_save_contact_status($1, $2, $3, $4, $5) AS trans_id', [
        params.candidateId,
        params.transId,
        params.roundId,
        params.contactStatusId,
        params.createdBy,
      ])
      return result.rows[0]?.trans_id as number
    } catch (error) {
      const msg = (error as Error).message
      logger.error('DB error in saveContactStatus', { message: msg, error })
      throw new AppError(`Database error: ${msg}`, 500)
    }
  },

  async saveRound(params: {
    candidateId: number
    roundId: number
    interviewerIds: number[]
    interviewDatetime: Date | null
    interviewTypeId: number | null
    actionId: number
    answers: Array<{ questionId: number; mappingId: number; answerText: string }>
    nextRoundId: number | null
    nextInterviewerIds: number[] | null
    nextInterviewDatetime: Date | null
    nextInterviewTypeId: number | null
    createdBy: number
  }): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT mechsoft.fn_ip_save_round(
          $1, $2, $3::bigint[], $4, $5::bigint,
          $6, $7::jsonb,
          $8, $9::bigint[], $10, $11::bigint,
          $12
        ) AS trans_id`,
        [
          params.candidateId,
          params.roundId,
          params.interviewerIds,
          params.interviewDatetime,
          params.interviewTypeId,
          params.actionId,
          JSON.stringify(params.answers),
          params.nextRoundId,
          params.nextInterviewerIds ?? [],
          params.nextInterviewDatetime,
          params.nextInterviewTypeId,
          params.createdBy,
        ]
      )
      return result.rows[0]?.trans_id as number
    } catch (error) {
      const msg = (error as Error).message
      logger.error('DB error in saveRound', { message: msg, error })
      throw new AppError(`Database error: ${msg}`, 500)
    }
  },

  async getCandidateHistory(candidateId: number): Promise<Record<string, unknown> | null> {
    try {
      const result = await pool.query('SELECT mechsoft.fn_ip_get_candidate_history($1) AS history', [candidateId])
      return (result.rows[0]?.history as Record<string, unknown>) ?? null
    } catch (error) {
      logger.error('DB error in getCandidateHistory', { error })
      throw new AppError('Database error', 500)
    }
  },
}
