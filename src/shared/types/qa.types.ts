// Common QA payload types — shared across JD, company profile, and any future module
// that uses the Python question-answer chat flow.

export interface QADataBlob {
  signal_context: Record<string, unknown>
  org_dna_context: Record<string, unknown>
  evidence_context: Record<string, unknown>
  conflict_context: Record<string, unknown>
  question_context: Record<string, unknown>
  attempt_counters: Record<string, unknown>
  interactions: unknown[]
  org_dna_snapshot: Record<string, unknown>
  question_counts: Record<string, unknown>
  field_values: Record<string, unknown>
  field_progress: Record<string, unknown>
}

export interface QANextQuestion {
  text: string
  field_key: string
  question_id: string
  mode: string
  can_be_skipped: boolean
  allowed_values: string[] | null
  answer_type: string | null
}

// Used for the first call (/start).
// Fresh start : id="1", session_id="", question_id="", data has only org_dna_snapshot.
// Resume      : id=actual jd_id, actual session_id/question_id,
//               data is the full dataBlob stored from previous session.
export interface QAStartRequest {
  id: string
  org_id: string
  user_id: string
  session_id: string
  question_id: string
  data: Record<string, unknown>
}

// Used for every subsequent call (/answer). Full data blob from the previous
// response must be passed back so Python can restore session state.
export interface QAAnswerRequest {
  session_id: string
  user_id: string
  field_key: string
  answer: string
  question_id: string
  data: QADataBlob
}

// Single response shape for both /start and /answer.
// next_question is null when completed === true.
export interface QAResponse {
  success: boolean
  completed: boolean
  session_id: string
  next_question: QANextQuestion | null
  data: QADataBlob
}
