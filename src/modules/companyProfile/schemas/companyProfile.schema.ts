import { z } from 'zod'

export const answerSchema = z.object({
  answer: z.string().min(1, 'Answer is required'),
})

export const editQuestionSchema = z.object({
  field_key: z.string().min(1, 'field_key is required'),
  answer: z.string().min(1, 'Answer is required'),
})

export const updateAnswerSchema = z.object({
  answer: z.string().min(1, 'Answer is required'),
})

export const updateRegistrationSchema = z.object({
  company_name:        z.string().min(1).optional(),
  company_email:       z.string().email().optional(),
  company_phone:       z.string().min(1).optional(),
  address:             z.string().min(1).optional(),
  website:             z.string().url().optional(),
  registration_number: z.string().min(1).optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field is required' }
)

export type AnswerDto = z.infer<typeof answerSchema>
export type EditQuestionDto = z.infer<typeof editQuestionSchema>
export type UpdateAnswerDto = z.infer<typeof updateAnswerSchema>
export type UpdateRegistrationDto = z.infer<typeof updateRegistrationSchema>
