import { z } from 'zod'

// Query params arrive as strings. '' / undefined are treated as "not sent".
const emptyToUndefined = (val: unknown): unknown => (val === undefined || val === '' ? undefined : val)

const optionalDate = (label: string) =>
  z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be in YYYY-MM-DD format`).optional()
  )

const optionalPositiveInt = (label: string) =>
  z.preprocess(
    (val) => (val !== undefined && val !== '' ? Number(val) : undefined),
    z.number().int().positive(`${label} must be a positive integer`).optional()
  )

// "1,2,3" (or a repeated param) → [1, 2, 3]
const optionalIdList = (label: string) =>
  z.preprocess(
    (val) => {
      if (val === undefined || val === '') return undefined
      const parts = Array.isArray(val) ? val : String(val).split(',')
      return parts.map((p) => String(p).trim()).filter((p) => p !== '').map(Number)
    },
    z.array(z.number().int().positive(`${label} must contain positive integers`)).optional()
  )

const optionalBoolean = z.preprocess(
  (val) => (val === 'true' || val === true ? true : val === 'false' || val === false ? false : undefined),
  z.boolean().optional().default(false)
)

const dateRange = {
  from_date: optionalDate('from_date'),
  to_date: optionalDate('to_date'),
}

const fromBeforeTo = (q: { from_date?: string; to_date?: string }): boolean =>
  q.from_date === undefined || q.to_date === undefined || q.from_date <= q.to_date

// Either a JD (jd_id) or the Unassigned bucket (unassigned=true) — exactly one.
const jdOrUnassigned = (q: { jd_id?: number; unassigned: boolean }): boolean =>
  q.unassigned ? q.jd_id === undefined : q.jd_id !== undefined

export const aiUsageJdsQuerySchema = z
  .object({
    ...dateRange,
    jd_ids: optionalIdList('jd_ids'),
  })
  .refine(fromBeforeTo, { message: 'from_date must be on or before to_date', path: ['from_date'] })

export const aiUsageJdProcessesQuerySchema = z
  .object({
    ...dateRange,
    jd_id: optionalPositiveInt('jd_id'),
    unassigned: optionalBoolean,
  })
  .refine(fromBeforeTo, { message: 'from_date must be on or before to_date', path: ['from_date'] })
  .refine(jdOrUnassigned, { message: 'Send either jd_id or unassigned=true', path: ['jd_id'] })

export const aiUsageJdCandidatesQuerySchema = z
  .object({
    ...dateRange,
    jd_id: optionalPositiveInt('jd_id'),
    unassigned: optionalBoolean,
    page: optionalPositiveInt('page').default(1),
    page_size: z.preprocess(
      (val) => (val !== undefined && val !== '' ? Number(val) : undefined),
      z.number().int().min(1, 'page_size must be at least 1').max(100, 'page_size must be at most 100').default(10)
    ),
  })
  .refine(fromBeforeTo, { message: 'from_date must be on or before to_date', path: ['from_date'] })
  .refine(jdOrUnassigned, { message: 'Send either jd_id or unassigned=true', path: ['jd_id'] })

export type AiUsageJdsQueryDto = z.infer<typeof aiUsageJdsQuerySchema>
export type AiUsageJdProcessesQueryDto = z.infer<typeof aiUsageJdProcessesQuerySchema>
export type AiUsageJdCandidatesQueryDto = z.infer<typeof aiUsageJdCandidatesQuerySchema>
