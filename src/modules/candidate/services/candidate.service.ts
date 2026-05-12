import { resumeExtractClient, ExtractedResumeRaw } from '../clients/resumeExtract.client'
import { candidateRepository } from '../repositories/candidate.repository'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx']
const MIN_FILE_SIZE_BYTES = 100

interface ValidFile {
  filename: string
  for_selection: boolean
  file: Express.Multer.File
}

interface ExtractResult {
  successExtraction: ExtractedResumeRaw[]
  duplicate: Array<{ filename: string; reason: string }>
  incomplete: Array<{ filename: string; reason: string }>
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
  const successExtraction: ExtractedResumeRaw[] = []
  const duplicate: Array<{ filename: string; reason: string }> = []
  const incomplete: Array<{ filename: string; reason: string }> = []

  // Step a: filter by status and position_relevance
  const valid = rawItems.filter((item) => {
    if (item.status === 'incomplete' || item.status === 'failed') {
      incomplete.push({ filename: item.filename, reason: 'Incomplete resume data' })
      return false
    }

    if (item.status === 'success' && item.position_relevance?.match === false) {
      incomplete.push({ filename: item.filename, reason: item.position_relevance.reason })
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
      duplicate.push({ filename: item.filename, reason: 'Duplicate within uploaded batch' })
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
      duplicate.push({ filename: item.filename, reason: 'Already exists in system' })
    } else {
      successExtraction.push(item)
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
    rawItems.forEach((item) => { item.resume_file_path = filePathMap.get(item.filename) ?? null })
    const result = await processExtracted(rawItems)

    logger.info('Resume upload extraction complete', {
      success: result.successExtraction.length,
      duplicate: result.duplicate.length,
      incomplete: result.incomplete.length,
    })

    return { status: 'extracted', ...result }
  },

  async selectCandidateFiles(
    files: Express.Multer.File[],
    positionTitle: string
  ): Promise<{ status: 'extracted' } & ExtractResult> {
    const filePathMap = new Map(files.map((f) => [f.originalname, f.path]))
    const rawItems = await resumeExtractClient.extractResumes(files, positionTitle)
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
  ): Promise<{ savedCount: number }> {
    let savedCount = 0

    for (const candidate of candidates) {
      const pi = (candidate.personal_info ?? {}) as Record<string, { value: unknown }>
      const pro = (candidate.professional_info ?? {}) as Record<string, unknown>

      const education = ((pro.education as { value: object[] } | undefined)?.value ?? [])
      const experience = ((pro.Experience as { value: object[] } | undefined)?.value ?? [])
      const technicalSkills = ((pro.technical_stack_and_tools as { value: string[] } | undefined)?.value ?? [])
      const coreSkills = ((pro.core_skills as { value: string[] } | undefined)?.value ?? [])
      const softSkills = ((pro.soft_skills as { value: string[] } | undefined)?.value ?? [])
      const responsibilities = ((pro.key_responsibilities as { value: string[] } | undefined)?.value ?? [])

      await candidateRepository.saveCandidateDetails({
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
        responsibilities,
        createdBy,
      })

      savedCount++
    }

    logger.info('Candidates saved', { jdId, savedCount })
    return { savedCount }
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

  async getJDDropdown(): Promise<Array<{ jd_id: number; label: string }>> {
    const list = await candidateRepository.getJDDropdown()
    logger.info('JD dropdown fetched', { count: list.length })
    return list
  },

  async updateCandidateScore(
    jdId: number,
    createdBy: number
  ): Promise<{ totalScored: number }> {
    // Step 1: Get JD weightage and extract weights object
    const weightageRaw = await candidateRepository.getJDWeightage(jdId)
    if (!weightageRaw) {
      throw new AppError('No weightage found for this JD', 404)
    }
    const weightsOnly = (weightageRaw.weights as Record<string, unknown>) ?? weightageRaw

    // Step 2: Get all candidates for this JD (professional_info + location + candidate_id)
    const candidates = await candidateRepository.getCandidatesForScoring(jdId)
    if (!candidates.length) {
      throw new AppError('No candidates found for this JD', 404)
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
