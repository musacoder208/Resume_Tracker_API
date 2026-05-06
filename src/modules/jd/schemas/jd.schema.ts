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
  company_id: z.coerce.number().int().positive('company_id is required'),
  job_title_id: optionalPositiveInt('job_title_id'),
  seniority_id: optionalPositiveInt('seniority_id'),
})

export type AnswerJdDto = z.infer<typeof answerJdSchema>
export type GetAllJdsDto = z.infer<typeof getAllJdsSchema>
