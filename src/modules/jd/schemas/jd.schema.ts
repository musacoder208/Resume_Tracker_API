import { z } from 'zod'

export const answerJdSchema = z.object({
  answer: z.string().min(1, 'Answer is required'),
  job_title_id: z.number().int().positive('job_title_id must be a positive integer'),
  seniority_id: z.number().int().positive('seniority_id must be a positive integer'),
})

export type AnswerJdDto = z.infer<typeof answerJdSchema>
