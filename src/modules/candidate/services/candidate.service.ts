import fs from 'fs'
import { resumeExtractClient, ExtractedResumeRaw } from '../clients/resumeExtract.client'
import { candidateRepository } from '../repositories/candidate.repository'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

function cleanupFiles(files: Express.Multer.File[]): void {
  for (const file of files) {
    fs.unlink(file.path, (err) => {
      if (err) logger.warn('Failed to delete temp file', { path: file.path, err })
    })
  }
}

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx']
const MIN_FILE_SIZE_BYTES = 100

interface ValidFile {
  filename: string
  for_selection: boolean
  file: Express.Multer.File
}

interface ExtractResult {
  successExtraction: Array<ExtractedResumeRaw & { isSelected: boolean }>
  duplicate: Array<ExtractedResumeRaw & { reason: string; isSelected: boolean }>
  incomplete: Array<ExtractedResumeRaw & { reason: string; isSelected: boolean }>
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot).toLowerCase() : ''
}

function validateFiles(files: Express.Multer.File[]): {
  valid: ValidFile[]
  incomplete: Array<{ filename: string; reason: string }>
} {
  const valid: ValidFile[] = []
  const incomplete: Array<{ filename: string; reason: string }> = []

  for (const file of files) {
    const ext = getExtension(file.originalname)

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      incomplete.push({ filename: file.originalname, reason: 'Invalid file extension' })
      continue
    }

    if (file.size < MIN_FILE_SIZE_BYTES) {
      incomplete.push({ filename: file.originalname, reason: 'File is empty or corrupted' })
      continue
    }

    valid.push({ filename: file.originalname, for_selection: true, file })
  }

  return { valid, incomplete }
}

async function processExtracted(rawItems: ExtractedResumeRaw[]): Promise<ExtractResult> {
  const successExtraction: Array<ExtractedResumeRaw & { isSelected: boolean }> = []
  const duplicate: Array<ExtractedResumeRaw & { reason: string; isSelected: boolean }> = []
  const incomplete: Array<ExtractedResumeRaw & { reason: string; isSelected: boolean }> = []

  // Step a: filter by status and position_relevance
  const valid = rawItems.filter((item) => {
    if (item.status === 'incomplete' || item.status === 'failed') {
      incomplete.push({ ...item, reason: 'Incomplete resume data', isSelected: false })
      return false
    }

    if (item.status === 'success' && item.position_relevance?.match === false) {
      incomplete.push({ ...item, reason: item.position_relevance.reason, isSelected: false })
      return false
    }

    return true
  })

  // Step b: detect duplicates within the uploaded batch
  const batchSeen = new Map<string, boolean>()
  const batchUnique: ExtractedResumeRaw[] = []

  for (const item of valid) {
    const pi = item.personal_info as Record<string, { value: string | null }> | undefined
    const key = [
      (pi?.full_name?.value ?? '').toLowerCase(),
      (pi?.email?.value ?? '').toLowerCase(),
      pi?.phone?.value ?? '',
    ].join('|')

    if (batchSeen.has(key)) {
      duplicate.push({ ...item, reason: 'Duplicate within uploaded batch', isSelected: false })
    } else {
      batchSeen.set(key, true)
      batchUnique.push(item)
    }
  }

  // Step c: check against DB
  for (const item of batchUnique) {
    const pi = item.personal_info as Record<string, { value: string | null }> | undefined
    const fullName = pi?.full_name?.value ?? ''
    const email = pi?.email?.value ?? ''
    const phone = pi?.phone?.value ?? ''

    const exists = await candidateRepository.checkDuplicate(fullName, email, phone)

    if (exists) {
      duplicate.push({ ...item, reason: 'Already exists in system', isSelected: false })
    } else {
      successExtraction.push({ ...item, isSelected: true })
    }
  }

  return { successExtraction, duplicate, incomplete }
}

export const candidateService = {
  async uploadResumes(
    files: Express.Multer.File[],
    positionTitle: string
  ): Promise<
    | { status: 'partial'; success: Omit<ValidFile, 'file'>[]; incomplete: Array<{ filename: string; reason: string }> }
    | ({ status: 'extracted' } & ExtractResult)
  > {
    const { valid, incomplete } = validateFiles(files)

    if (incomplete.length > 0) {
      logger.info('Partial upload — invalid files found', { incompleteCount: incomplete.length })
      return {
        status: 'partial',
        success: valid.map(({ filename, for_selection }) => ({ filename, for_selection })),
        incomplete,
      }
    }

    const filePathMap = new Map(valid.map((v) => [v.file.originalname, v.file.path]))
    const rawItems = await resumeExtractClient.extractResumes(valid.map((v) => v.file), positionTitle)
    cleanupFiles(valid.map((v) => v.file))
    rawItems.forEach((item) => { item.resume_file_path = filePathMap.get(item.filename) ?? null })
    const result = await processExtracted(rawItems)

    logger.info('Resume upload extraction complete', {
      success: result.successExtraction.length,
      duplicate: result.duplicate.length,
      incomplete: result.incomplete.length,
    })

    return { status: 'extracted', ...result }
  },

  async uploadResumesStream(
    files: Express.Multer.File[],
    positionTitle: string,
    jdId: number,
    createdBy: number,
    push: (data: Record<string, unknown>) => void
  ): Promise<void> {
    const { valid, incomplete } = validateFiles(files)

    for (const inc of incomplete) {
      push({ filename: inc.filename, status: 'incomplete', reason: inc.reason, isSelected: false })
    }

    if (!valid.length) return

    const filePathMap = new Map(valid.map((v) => [v.file.originalname, v.file.path]))
    const batchSeen = new Map<string, boolean>()

    await resumeExtractClient.extractResumes(valid.map((v) => v.file), positionTitle, async (item) => {
      item.resume_file_path = filePathMap.get(item.filename) ?? null

      if (item.status === 'incomplete' || item.status === 'failed') {
        push({ ...item, reason: 'Incomplete resume data', isSelected: false })
        return
      }

      if (item.status === 'success' && item.position_relevance?.match === false) {
        push({ ...item, reason: item.position_relevance.reason, isSelected: false })
        return
      }

      const pi = item.personal_info as Record<string, { value: string | null }> | undefined
      const fullName = pi?.full_name?.value ?? ''
      const email    = pi?.email?.value ?? ''
      const phone    = pi?.phone?.value ?? ''
      const batchKey = `${fullName.toLowerCase()}|${email.toLowerCase()}|${phone}`

      if (batchSeen.has(batchKey)) {
        push({ ...item, reason: 'Duplicate within uploaded batch', isSelected: false })
        return
      }
      batchSeen.set(batchKey, true)

      const exists = await candidateRepository.checkDuplicate(fullName, email, phone)
      if (exists) {
        push({ ...item, reason: 'Already exists in system', isSelected: false })
        return
      }

      const pro          = (item.professional_info ?? {}) as Record<string, unknown>
      const education    = ((pro.education as { value: object[] } | undefined)?.value ?? [])
      const experience   = ((pro.Experience as { value: object[] } | undefined)?.value ?? [])
      const techSkills   = ((pro.technical_stack_and_tools as { value: string[] } | undefined)?.value ?? [])
      const coreSkills   = ((pro.core_skills as { value: string[] } | undefined)?.value ?? [])
      const softSkills   = ((pro.soft_skills as { value: string[] } | undefined)?.value ?? [])

      const candidateId = await candidateRepository.saveCandidateDetails({
        jdId,
        fullName,
        email,
        phone,
        location:         (pi?.location?.value as string | null) ?? null,
        linkedinUrl:      (pi?.linkedin_url?.value as string | null) ?? null,
        githubUrl:        (pi?.github_url?.value as string | null) ?? null,
        portfolioLinks:   (pi?.portfolio_links?.value as string[] | null) ?? null,
        currentJobTitle:  ((pro.job_title as { value: string } | undefined)?.value) ?? null,
        currentCompany:   ((pro.current_company as { value: string } | undefined)?.value) ?? null,
        totalExperience:  ((pro.total_years_experience as { value: number } | undefined)?.value) ?? null,
        resumeFileName:   (item.filename as string) ?? null,
        resumeFilePath:   (item.resume_file_path as string | null) ?? null,
        rawAiResponse:    item,
        education,
        experience,
        technicalSkills:  techSkills,
        coreSkills,
        softSkills,
        createdBy,
      })

      push({ ...item, candidate_id: candidateId, isSelected: true })
    })

    cleanupFiles(valid.map((v) => v.file))
  },

  async selectCandidateFiles(
    files: Express.Multer.File[],
    positionTitle: string
  ): Promise<{ status: 'extracted' } & ExtractResult> {
    const filePathMap = new Map(files.map((f) => [f.originalname, f.path]))
    const rawItems = await resumeExtractClient.extractResumes(files, positionTitle)
    cleanupFiles(files)
    rawItems.forEach((item) => { item.resume_file_path = filePathMap.get(item.filename) ?? null })
    const result = await processExtracted(rawItems)

    logger.info('Selected candidate files extracted', {
      success: result.successExtraction.length,
      duplicate: result.duplicate.length,
      incomplete: result.incomplete.length,
    })

    return { status: 'extracted', ...result }
  },

  async saveCandidates(
    jdId: number,
    createdBy: number,
    candidates: Record<string, unknown>[]
  ): Promise<{ savedCount: number; candidateIds: number[] }> {
    const candidateIds: number[] = []

    for (const candidate of candidates) {
      const pi = (candidate.personal_info ?? {}) as Record<string, { value: unknown }>
      const pro = (candidate.professional_info ?? {}) as Record<string, unknown>

      const education = ((pro.education as { value: object[] } | undefined)?.value ?? [])
      const experience = ((pro.Experience as { value: object[] } | undefined)?.value ?? [])
      const technicalSkills = ((pro.technical_stack_and_tools as { value: string[] } | undefined)?.value ?? [])
      const coreSkills = ((pro.core_skills as { value: string[] } | undefined)?.value ?? [])
      const softSkills = ((pro.soft_skills as { value: string[] } | undefined)?.value ?? [])

      const candidateId = await candidateRepository.saveCandidateDetails({
        jdId,
        fullName: (pi.full_name?.value as string) ?? '',
        email: (pi.email?.value as string) ?? '',
        phone: (pi.phone?.value as string) ?? '',
        location: (pi.location?.value as string | null) ?? null,
        linkedinUrl: (pi.linkedin_url?.value as string | null) ?? null,
        githubUrl: (pi.github_url?.value as string | null) ?? null,
        portfolioLinks: (pi.portfolio_links?.value as string[] | null) ?? null,
        currentJobTitle: ((pro.job_title as { value: string } | undefined)?.value) ?? null,
        currentCompany: ((pro.current_company as { value: string } | undefined)?.value) ?? null,
        totalExperience: ((pro.total_years_experience as { value: number } | undefined)?.value) ?? null,
        resumeFileName: (candidate.filename as string) ?? null,
        resumeFilePath: (candidate.resume_file_path as string | null) ?? null,
        rawAiResponse: candidate,
        education,
        experience,
        technicalSkills,
        coreSkills,
        softSkills,
        createdBy,
      })

      candidateIds.push(candidateId)
    }

    logger.info('Candidates saved', { jdId, savedCount: candidateIds.length })
    return { savedCount: candidateIds.length, candidateIds }
  },

  async getFeedbackTypes(): Promise<Array<{ feedback_type_id: number; feedback_type: string }>> {
    const list = await candidateRepository.getFeedbackTypes()
    logger.info('Feedback types fetched', { count: list.length })
    return list
  },

  async saveCandidateFeedback(params: {
    candidateId: number
    feedbackTypeId: number
    userFeedback: string
    createdBy: number
  }): Promise<void> {
    await candidateRepository.saveCandidateFeedback(params)
    logger.info('Candidate feedback saved', { candidateId: params.candidateId, feedbackTypeId: params.feedbackTypeId })
  },

  async getCandidateDetailsById(candidateId: number): Promise<Record<string, unknown>> {
    const details = await candidateRepository.getCandidateDetailsById(candidateId)
    if (!details) {
      throw new AppError('Candidate not found', 404)
    }
    logger.info('Candidate details fetched', { candidateId })
    return details
  },

  async getCandidateList(params: {
    jdId?: number
    searchText?: string
    verdict?: string
    experienceRange?: string
    page: number
    pageSize: number
  }): Promise<{
    summary: Record<string, unknown>
    candidates: Record<string, unknown>[]
    totalCount: number
    totalPages: number
  }> {
    const data = await candidateRepository.getCandidateList(params)
    const totalPages = Math.ceil(data.totalCount / params.pageSize)
    logger.info('Candidate list fetched', { count: data.candidates.length, totalCount: data.totalCount, ...params })
    return { ...data, totalPages }
  },

  async getJDDropdown(): Promise<Array<{ jd_id: number; label: string }>> {
    const list = await candidateRepository.getJDDropdown()
    logger.info('JD dropdown fetched', { count: list.length })
    return list
  },

  async updateCandidateScore(
    jdId: number,
    candidateIds: number[],
    createdBy: number
  ): Promise<{ totalScored: number }> {
    // Step 1: Get JD weightage and extract weights object
    const weightageRaw = await candidateRepository.getJDWeightage(jdId)
    if (!weightageRaw) {
      throw new AppError('No weightage found for this JD', 404)
    }
    const weightsOnly = (weightageRaw.weights as Record<string, unknown>) ?? weightageRaw

    // Step 2: Get only the requested candidates for this JD from DB
    const candidates = await candidateRepository.getCandidatesForScoring(jdId, candidateIds)
    if (!candidates.length) {
      throw new AppError('No candidates found for the provided IDs', 404)
    }

    // Step 3: Call Python scoring API
    const scoreResponse = await resumeExtractClient.scoreResumes(weightsOnly, candidates)

    // Step 4: Save each candidate score to DB
    for (const result of scoreResponse.results) {
      await candidateRepository.saveCandidateScore({
        candidateId: Number(result.candidate_id),
        baseScore: result.base_score,
        finalScore: result.final_score,
        verdict: result.verdict,
        scoreJson: result,
        groupBreakdown: result.group_breakdown as Record<string, unknown>,
        createdBy,
      })
    }

    logger.info('Candidate scores updated', { jdId, totalScored: scoreResponse.results.length })
    return { totalScored: scoreResponse.results.length }
  },
}
