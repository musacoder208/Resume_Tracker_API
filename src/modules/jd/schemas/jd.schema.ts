import { z } from 'zod'

export const answerJdSchema = z.object({
  answer: z.string().min(1, 'Answer is required'),
  job_title_id: z.number().int().positive('job_title_id must be a positive integer'),
  seniority_id: z.number().int().positive('seniority_id must be a positive integer'),
})

// Query params arrive as strings. z.coerce.number() turns undefined → NaN which
// Zod rejects. z.preprocess short-circuits to undefined before coercion.
const optionalPositiveInt = (label: string) =>
  z.preprocess(
    (val) => (val !== undefined && val !== '' ? Number(val) : undefined),
    z.number().int().positive(`${label} must be a positive integer`).optional()
  )

const ALLOWED_SORT_BY = ['job_title', 'seniority', 'min_exp', 'max_exp', 'status_name', 'work_model', 'start_date'] as const

export const getAllJdsSchema = z.object({
  job_title_id: optionalPositiveInt('job_title_id'),
  seniority_id: optionalPositiveInt('seniority_id'),
  status_id:    optionalPositiveInt('status_id'),
  page: z.preprocess(
    (val) => (val !== undefined && val !== '' ? Number(val) : 1),
    z.number().int().positive('page must be a positive integer').default(1)
  ),
  page_size: z.preprocess(
    (val) => (val !== undefined && val !== '' ? Number(val) : 10),
    z.number().int().positive('page_size must be a positive integer').default(10)
  ),
  sort_by: z.preprocess(
    (val) => (val !== undefined && val !== '' ? val : 'start_date'),
    z.enum(ALLOWED_SORT_BY, { message: `sort_by must be one of: ${ALLOWED_SORT_BY.join(', ')}` }).default('start_date')
  ),
  sort_order: z.preprocess(
    (val) => (val !== undefined && val !== '' ? String(val).toLowerCase() : 'desc'),
    z.enum(['asc', 'desc'], { message: 'sort_order must be asc or desc' }).default('desc')
  ),
})

export const jdByIdSchema = z.object({
  jd_id: z.coerce.number().int().positive('jd_id must be a positive integer'),
})

export const generateWeightageSchema = z.object({
  jd_id: z.number().int().positive('jd_id must be a positive integer'),
  additional_notes: z.string().optional().default(''),
})

export const updateWeightageSchema = z.object({
  jd_id: z.number().int().positive('jd_id must be a positive integer'),
  user_command: z.string().min(1, 'user_command is required'),
  field_values: z.record(z.unknown()).default({}),
  current_weights: z.record(z.unknown()).default({}),
  company_info: z.record(z.unknown()).default({}),
  force_override: z.boolean().default(false),
  conversation_history: z.array(z.unknown()).default([]),
})

export const updateTheorySchema = z.object({
  jd_id: z.number().int().positive('jd_id must be a positive integer'),
  edit_command: z.string().min(1, 'edit_command is required'),
  field_values: z.record(z.unknown()).default({}),
  rendered_text: z.string().min(1, 'rendered_text is required'),
})

export const editQaSchema = z.object({
  jd_id: z.number().int().positive('jd_id must be a positive integer'),
  field_key: z.string().min(1, 'field_key is required'),
  answer: z.string().min(1, 'answer is required'),
  field_values: z.record(z.unknown()).default({}),
  field_progress: z.record(z.unknown()).default({}),
})

export const updateQaSchema = z.object({
  answer: z.string().min(1, 'answer is required'),
})

export const publishJdSchema = z.object({
  jd_id: z.number().int().positive('jd_id must be a positive integer'),
})

export type AnswerJdDto = z.infer<typeof answerJdSchema>
export type GetAllJdsDto = z.infer<typeof getAllJdsSchema>
export type JdByIdDto = z.infer<typeof jdByIdSchema>
export type GenerateWeightageDto = z.infer<typeof generateWeightageSchema>
export type UpdateWeightageDto = z.infer<typeof updateWeightageSchema>
export type UpdateTheoryDto = z.infer<typeof updateTheorySchema>
export type EditQaDto = z.infer<typeof editQaSchema>
export type UpdateQaDto = z.infer<typeof updateQaSchema>
export type PublishJdDto = z.infer<typeof publishJdSchema>
