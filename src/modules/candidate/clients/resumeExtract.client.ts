import fs from 'fs'
import axios from 'axios'
import FormData from 'form-data'
import { env } from '@shared/config/env'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

export interface PositionRelevance {
  match: boolean
  position_title: string
  resume_job_title: string
  reason: string
}

export interface ExtractedResumeRaw {
  filename: string
  status: 'success' | 'failed' | 'incomplete'
  position_relevance?: PositionRelevance | null
  personal_info?: Record<string, { value: unknown }>
  professional_info?: Record<string, unknown>
  [key: string]: unknown
}

export interface GroupBreakdown {
  group_score: number
  weight: number
  penalty_factor: number
  final_contribution: number
  net_contribution: number
  missing_required: string[]
  present_required: string[]
  optional_present: string[]
  optional_missing: string[]
  llm_classifications: Record<string, string>
}

export interface ScoreResult {
  base_score: number
  constraint_delta: number
  constraint_effects: unknown[]
  hard_filter_failed: boolean
  final_score: number
  net_contribution: number
  verdict: string
  group_breakdown: Record<string, GroupBreakdown>
  candidate_id: string
}

export interface ScoreResumeResponse {
  success: boolean
  total_resumes: number
  results: ScoreResult[]
}

export const resumeExtractClient = {
  async extractResumes(files: Express.Multer.File[], positionTitle: string): Promise<ExtractedResumeRaw[]> {
    try {
      const form = new FormData()
      form.append('position_title', positionTitle)
      files.forEach((file) => {
        form.append('files', fs.createReadStream(file.path), {
          filename: file.originalname,
          contentType: file.mimetype,
        })
      })

      const response = await axios.post<{ status: string; total: number; results: ExtractedResumeRaw[] }>(
        `${env.CANDIDATE_EXTRACT_API_URL}/extract-resume`,
        form,
        { headers: form.getHeaders() }
      )

      logger.info('Python resume extraction called', { fileCount: files.length, positionTitle })

      const raw = response.data as unknown
      if (Array.isArray(raw)) return raw as ExtractedResumeRaw[]
      if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).results)) {
        return (raw as { results: ExtractedResumeRaw[] }).results
      }
      return [raw as ExtractedResumeRaw]
    } catch (error) {
      logger.error('Python resume extraction failed', { error })
      throw new AppError('Resume extraction service unavailable', 503)
    }
  },

  async scoreResumes(
    weightageJson: Record<string, unknown>,
    resumeJson: Record<string, unknown>[]
  ): Promise<ScoreResumeResponse> {
    try {
      const response = await axios.post<ScoreResumeResponse>(
        `${env.CANDIDATE_SCORING_API_URL}/score-resume`,
        { weightage_json: weightageJson, resume_json: resumeJson }
      )
      logger.info('Python scoring called', { candidateCount: resumeJson.length })
      return response.data
    } catch (error) {
      logger.error('Python scoring failed', { error })
      throw new AppError('Scoring service unavailable', 503)
    }
  },
}
