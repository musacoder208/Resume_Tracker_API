import { z } from 'zod'

export const answerSchema = z.object({
  answer: z.string().min(1, 'Answer is required'),
})

export const updateStartSchema = z.object({
  field_key: z.string().min(1, 'field_key is required'),
})

export const updateRespondSchema = z.object({
  answer: z.string().min(1, 'Answer is required'),
})

export type AnswerDto = z.infer<typeof answerSchema>
export type UpdateStartDto = z.infer<typeof updateStartSchema>
export type UpdateRespondDto = z.infer<typeof updateRespondSchema>
