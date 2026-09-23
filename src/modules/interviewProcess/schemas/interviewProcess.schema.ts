import { z } from 'zod'

// Query params arrive as strings. z.preprocess short-circuits '' / undefined
// before coercion so z.number() doesn't reject them as NaN.
const optionalPositiveInt = (label: string) =>
  z.preprocess(
    (val) => (val !== undefined && val !== '' ? Number(val) : undefined),
    z.number().int().positive(`${label} must be a positive integer`).optional()
  )

const requiredPositiveIntQuery = (label: string) =>
  z.preprocess(
    (val) => (val !== undefined && val !== '' ? Number(val) : undefined),
    z.number({ message: `${label} is required` }).int().positive(`${label} must be a positive integer`)
  )

// clientId is accepted for API-shape compatibility but is never trusted for
// tenant scoping — every query is scoped by req.tenantId (from the JWT) instead.
export const roundsQuerySchema = z.object({
  clientId: optionalPositiveInt('clientId'),
})

export const questionsQuerySchema = z.object({
  clientId: optionalPositiveInt('clientId'),
  jdId: requiredPositiveIntQuery('jdId'),
  seniorityId: requiredPositiveIntQuery('seniorityId'),
  roundId: requiredPositiveIntQuery('roundId'),
  actionId: requiredPositiveIntQuery('actionId'),
})

export const candidateIdParamsSchema = z.object({
  candidateId: z.coerce.number().int().positive('candidateId must be a positive integer'),
})

// Body IDs are coerced too — multi-selects / form inputs on the UI side
// commonly emit numeric values as strings (e.g. interviewerIds from a
// checkbox/multi-select), same reason jd_id is coerced in the JD module.
const coercedPositiveInt = (label: string) => z.coerce.number().int().positive(`${label} must be a positive integer`)

export const saveContactStatusSchema = z.object({
  transId: coercedPositiveInt('transId').optional(),
  roundId: coercedPositiveInt('roundId'),
  contactStatusId: coercedPositiveInt('contactStatusId'),
})

const answerSchema = z.object({
  questionId: coercedPositiveInt('questionId'),
  mappingId: coercedPositiveInt('mappingId'),
  answerText: z.string().optional().default(''),
})

const nextRoundSchema = z.object({
  roundId: coercedPositiveInt('nextRound.roundId'),
  interviewerIds: z.array(coercedPositiveInt('nextRound.interviewerIds')).default([]),
  interviewDatetime: z.coerce.date().optional(),
  // FK -> mst_interviewmode.id (from GET /interview-modes), NOT the mode's code/name string.
  interviewTypeId: coercedPositiveInt('nextRound.interviewTypeId').optional(),
})

export const saveRoundSchema = z.object({
  roundId: coercedPositiveInt('roundId'),
  interviewerIds: z.array(coercedPositiveInt('interviewerIds')).default([]),
  interviewDatetime: z.coerce.date().optional(),
  // FK -> mst_interviewmode.id (from GET /interview-modes), NOT the mode's code/name string.
  interviewTypeId: coercedPositiveInt('interviewTypeId').optional(),
  actionId: coercedPositiveInt('actionId'),
  answers: z.array(answerSchema).default([]),
  nextRound: nextRoundSchema.optional(),
})

export type RoundsQueryDto = z.infer<typeof roundsQuerySchema>
export type QuestionsQueryDto = z.infer<typeof questionsQuerySchema>
export type CandidateIdParamsDto = z.infer<typeof candidateIdParamsSchema>
export type SaveContactStatusDto = z.infer<typeof saveContactStatusSchema>
export type SaveRoundDto = z.infer<typeof saveRoundSchema>
