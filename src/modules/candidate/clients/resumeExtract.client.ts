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
  async extractResumes(
    files: Express.Multer.File[],
    positionTitle: string,
    onResult?: (result: ExtractedResumeRaw) => Promise<void>,
    meta?: { jdId: number; orgId: number; createdBy: number }
  ): Promise<ExtractedResumeRaw[]> {
    try {
      const form = new FormData()
      form.append('position_title', positionTitle)
      if (meta) {
        form.append('jd_id',      String(meta.jdId))
        form.append('org_id',     String(meta.orgId))
        form.append('user_id', String(meta.createdBy))
      }
      files.forEach((file) => {
        form.append('files', fs.createReadStream(file.path), {
          filename: file.originalname,
          contentType: file.mimetype,
        })
        form.append('file_paths', file.path)
      })

      const response = await axios.post(
        `${env.CANDIDATE_EXTRACT_API_URL}/extract-resume-stream`,
        form,
        { headers: form.getHeaders(), responseType: 'stream' }
      )

      logger.info('Python resume extraction stream started', { fileCount: files.length, positionTitle })

      return new Promise<ExtractedResumeRaw[]>((resolve, reject) => {
        const results: ExtractedResumeRaw[] = []
        let buffer = ''
        let processingChain = Promise.resolve()

        response.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (payload === '[DONE]') continue
            try {
              const parsed = JSON.parse(payload) as ExtractedResumeRaw
              results.push(parsed)
              if (onResult) {
                processingChain = processingChain.then(() => onResult(parsed))
              }
            } catch {
              logger.warn(`Failed to parse SSE line: ${line}`)
            }
          }
        })

        response.data.on('end', () => {
          processingChain.then(() => {
            logger.info(`SSE extraction complete. Total parsed: ${results.length}`)
            resolve(results)
          }).catch(reject)
        })

        response.data.on('error', (err: Error) => {
          reject(new AppError('Resume extraction service unavailable', 503))
        })
      })
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
