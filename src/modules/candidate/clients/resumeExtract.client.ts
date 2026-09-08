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

export const resumeExtractClient = {
  async extractResumes(
    files: Express.Multer.File[],
    positionTitle: string,
    orgId: number,
    userId: number,
    onResult?: (result: ExtractedResumeRaw) => Promise<void>,
    meta?: { jdId: number; orgId: number; createdBy: number }
  ): Promise<ExtractedResumeRaw[]> {
    try {
      const form = new FormData()
      form.append('position_title', positionTitle)
      form.append('isForceFully', 'false')
      form.append('org_id', String(orgId))
      form.append('user_id', String(userId))
      if (meta) {
        form.append('jd_id', String(meta.jdId))
        form.append('org_id', String(meta.orgId))
        form.append('user_id', String(meta.createdBy))
      }
      files.forEach((file) => {
        form.append('files', fs.createReadStream(file.path), {
          filename: file.originalname,
          contentType: file.mimetype,
        })
        form.append('file_paths', file.path)
        form.append('candidate_id', '0')
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
    resumeJson: Record<string, unknown>[],
    orgId: number,
    userId: number
  ): Promise<{ totalScored: number }> {
    try {
      const response = await axios.post(
        `${env.CANDIDATE_SCORING_API_URL}/score-resume-stream`,
        { weightage_json: weightageJson, resume_json: resumeJson, org_id: String(orgId), user_id: String(userId) },
        {
          responseType: 'stream',
          timeout: 300000,
          headers: { Accept: 'text/event-stream' },
        }
      )

      logger.info('Python scoring stream started', { candidateCount: resumeJson.length })

      return new Promise<{ totalScored: number }>((resolve) => {
        let totalScored = 0
        let buffer = ''
        let settled = false

        const settle = () => {
          if (!settled) {
            settled = true
            resolve({ totalScored })
          }
        }

        response.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (payload === '[DONE]') {
              settle()
              return
            }
            try {
              const event = JSON.parse(payload) as { status?: string }
              if (event.status === 'saved') totalScored++
            } catch {
              logger.warn(`Failed to parse score SSE line: ${line}`)
            }
          }
        })

        response.data.on('end', () => settle())

        response.data.on('error', (err: Error) => {
          logger.error('Score stream error', { err })
          settle()
        })
      })
    } catch (error) {
      logger.error('Python scoring stream failed', { error })
      throw new AppError('Scoring service unavailable', 503)
    }
  },
}
