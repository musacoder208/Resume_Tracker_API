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

export const getAllJdsSchema = z.object({
  job_title_id: optionalPositiveInt('job_title_id'),
  seniority_id: optionalPositiveInt('seniority_id'),
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
})

export const updateTheorySchema = z.object({
  jd_id: z.number().int().positive('jd_id must be a positive integer'),
  edit_command: z.string().min(1, 'edit_command is required'),
})

export const editQaSchema = z.object({
  jd_id: z.number().int().positive('jd_id must be a positive integer'),
  field_key: z.string().min(1, 'field_key is required'),
  answer: z.string().min(1, 'answer is required'),
})

export const updateQaSchema = z.object({
  answer: z.string().min(1, 'answer is required'),
})

export type AnswerJdDto = z.infer<typeof answerJdSchema>
export type GetAllJdsDto = z.infer<typeof getAllJdsSchema>
export type JdByIdDto = z.infer<typeof jdByIdSchema>
export type GenerateWeightageDto = z.infer<typeof generateWeightageSchema>
export type UpdateWeightageDto = z.infer<typeof updateWeightageSchema>
export type UpdateTheoryDto = z.infer<typeof updateTheorySchema>
export type EditQaDto = z.infer<typeof editQaSchema>
export type UpdateQaDto = z.infer<typeof updateQaSchema>
