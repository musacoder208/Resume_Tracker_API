import { z } from 'zod'

export const saveCandidatesSchema = z.object({
  jd_id: z.number().int().positive('jd_id is required'),
  candidates: z.array(z.record(z.unknown())).min(1, 'At least one candidate is required'),
})

export const updateCandidateScoreSchema = z.object({
  jd_id: z.number().int().positive('jd_id is required'),
  candidate_ids: z.array(z.number().int().positive()).min(1, 'At least one candidate_id is required'),
})

export const saveCandidateFeedbackSchema = z.object({
  candidate_id:     z.number().int().positive('candidate_id is required'),
  feedback_type_id: z.number().int().positive('feedback_type_id is required'),
  user_feedback:    z.string().min(1, 'user_feedback is required'),
})

export const updateCandidateDetailsSchema = z.object({
  candidate_id:      z.number().int().positive('candidate_id is required'),
  email:             z.string().email('Invalid email').min(1, 'email is required'),
  phone:             z.string().min(1, 'phone is required'),
  total_experience:  z.number().min(0, 'total_experience must be 0 or more'),
})

export const saveHRAnswersSchema = z.object({
  candidate_id: z.number().int().positive('candidate_id is required'),
  answers: z.array(z.object({
    question_key: z.string().min(1, 'question_key is required'),
    answer_text:  z.string(),
  })).min(1, 'At least one answer is required'),
})

export const saveHRFeedbackSchema = z.object({
  candidate_id: z.number().int().positive('candidate_id is required'),
  feedbacks: z.array(z.object({
    group_score_id:   z.number().int().positive('group_score_id is required'),
    feedback_type_id: z.number().int().positive('feedback_type_id is required'),
    user_feedback:    z.string().min(1, 'user_feedback is required'),
  })).min(1, 'At least one feedback item is required'),
})

export const getCandidateListSchema = z.object({
  jd_id:             z.coerce.number().int().positive().optional(),
  search_text:       z.string().optional(),
  verdict:           z.string().optional(),
  experience_range:  z.enum(['0-1', '1-3', '3-5', '5-8', '8+']).optional(),
  status_id:         z.coerce.number().int().positive().optional(),
  hr_status_code:    z.string().optional(),
  page:              z.coerce.number().int().positive().default(1),
  page_size:         z.coerce.number().int().positive().max(100).default(20),
})

export type UpdateCandidateDetailsDto = z.infer<typeof updateCandidateDetailsSchema>
export type SaveHRAnswersDto          = z.infer<typeof saveHRAnswersSchema>
export type SaveCandidatesDto        = z.infer<typeof saveCandidatesSchema>
export type UpdateCandidateScoreDto  = z.infer<typeof updateCandidateScoreSchema>
export type SaveCandidateFeedbackDto = z.infer<typeof saveCandidateFeedbackSchema>
export type SaveHRFeedbackDto        = z.infer<typeof saveHRFeedbackSchema>
export type GetCandidateListDto      = z.infer<typeof getCandidateListSchema>
