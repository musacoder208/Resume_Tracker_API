import { z } from 'zod'

export const saveCandidatesSchema = z.object({
  jd_id: z.number().int().positive('jd_id is required'),
  created_by: z.number().int().positive('created_by is required'),
  candidates: z.array(z.record(z.unknown())).min(1, 'At least one candidate is required'),
})

export const updateCandidateScoreSchema = z.object({
  jd_id: z.number().int().positive('jd_id is required'),
  created_by: z.number().int().positive('created_by is required'),
})

export const saveCandidateFeedbackSchema = z.object({
  candidate_id:     z.number().int().positive('candidate_id is required'),
  feedback_type_id: z.number().int().positive('feedback_type_id is required'),
  user_feedback:    z.string().min(1, 'user_feedback is required'),
  created_by:       z.number().int().positive('created_by is required'),
})

export type SaveCandidatesDto = z.infer<typeof saveCandidatesSchema>
export type UpdateCandidateScoreDto = z.infer<typeof updateCandidateScoreSchema>
export type SaveCandidateFeedbackDto = z.infer<typeof saveCandidateFeedbackSchema>
