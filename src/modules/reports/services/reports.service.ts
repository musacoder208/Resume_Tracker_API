import ExcelJS from 'exceljs'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'
import { reportsRepository } from '../repositories/reports.repository'
import type {
  AiUsageJdsQueryDto,
  AiUsageJdProcessesQueryDto,
  AiUsageJdCandidatesQueryDto,
} from '../schemas/reports.schema'

// Grouping, JD resolution and active-record filtering live in the PostgreSQL
// functions (db_rules §9) — the service only maps validated input to parameters
// and, for the export, lays the rows out in an Excel workbook.

// ── Excel export types (shape returned by mechsoft.fn_get_ai_usage_export) ────

interface ExportTotals {
  calls: number
  failed_calls: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  total_cost: number | string
}

interface ExportData {
  filters: { jd_names: string[]; created_by: string | null }
  summary: ExportTotals & { total_jds: number; total_candidates: number }
  jds: Array<ExportTotals & { jd_id: number; jd_name: string | null; created_date: string | null; candidate_count: number }>
  jd_processes: Array<ExportTotals & { jd_id: number; jd_name: string | null; module: string; feature: string }>
  candidates: Array<ExportTotals & {
    jd_id: number
    jd_name: string | null
    candidate_id: number
    full_name: string | null
    candidate_ids: string
    uploaded_date: string | null
    module: string
    feature: string
  }>
}

export interface AiUsageExportFile {
  buffer: Buffer
  fileName: string
}

// ── Excel helpers ─────────────────────────────────────────────────────────────

const ACRONYMS = new Set(['ai', 'jd', 'llm', 'hr', 'ocr', 'id'])

// ai_evaluation → "AI Evaluation" (same rule as the UI)
const toLabel = (code: string | null): string =>
  (code ?? '')
    .split(/[_\-\s]+/)
    .filter((w) => w !== '')
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')

const toNumber = (value: number | string | null | undefined): number => {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

// DB dates are IST wall-clock values without time zone ('2026-10-13T11:25:04.72'
// or '2026-10-13'). Excel has no time zones, so keep the wall-clock value as-is.
const toExcelDate = (value: string | null | undefined): Date | null => {
  if (value == null || value === '') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value)
  if (m == null) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)))
}

const nowInIst = (): Date => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  )
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second))
}

const FMT_INT = '#,##0'
// Same rounding as the UI (formatCost): totals $0.0000, sub-process rows $0.000000
const FMT_COST = '"$"0.0000'
const FMT_COST_DETAIL = '"$"0.000000'
const FMT_DATE = 'dd-mmm-yyyy'
const FMT_DATETIME = 'dd-mmm-yyyy hh:mm'

const usageColumns: Partial<ExcelJS.Column>[] = [
  { header: 'Calls', key: 'calls', width: 10, style: { numFmt: FMT_INT } },
  { header: 'Failed', key: 'failed_calls', width: 10, style: { numFmt: FMT_INT } },
  { header: 'Input Tokens', key: 'input_tokens', width: 15, style: { numFmt: FMT_INT } },
  { header: 'Output Tokens', key: 'output_tokens', width: 15, style: { numFmt: FMT_INT } },
  { header: 'Total Tokens', key: 'total_tokens', width: 15, style: { numFmt: FMT_INT } },
  { header: 'Cost ($)', key: 'total_cost', width: 14, style: { numFmt: FMT_COST } },
]

const usageValues = (t: ExportTotals): Record<string, number> => ({
  calls: toNumber(t.calls),
  failed_calls: toNumber(t.failed_calls),
  input_tokens: toNumber(t.input_tokens),
  output_tokens: toNumber(t.output_tokens),
  total_tokens: toNumber(t.total_tokens),
  total_cost: toNumber(t.total_cost),
})

// Bold header row, frozen, with auto filter
const finishTableSheet = (sheet: ExcelJS.Worksheet): void => {
  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } }
}

// Groups rows by key, keeping the order the database returned them in
function groupRows<T>(rows: T[], key: (row: T) => string): Array<[string, T[]]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = groups.get(k)
    if (list != null) list.push(row)
    else groups.set(k, [row])
  }
  return [...groups.entries()]
}

// Total row = sum of its sub-process rows (each already a SQL total)
const sumUsage = (rows: ExportTotals[]): Record<string, number> => {
  const sum = { calls: 0, failed_calls: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, total_cost: 0 }
  for (const r of rows) {
    const v = usageValues(r)
    sum.calls += v.calls
    sum.failed_calls += v.failed_calls
    sum.input_tokens += v.input_tokens
    sum.output_tokens += v.output_tokens
    sum.total_tokens += v.total_tokens
    sum.total_cost += v.total_cost
  }
  // avoid floating-point noise like 0.0504220000001
  sum.total_cost = Math.round(sum.total_cost * 1e6) / 1e6
  return sum
}

// level 0 = JD / candidate total (bold + shaded), level 1 = main process total (bold)
const styleTotalRow = (row: ExcelJS.Row, level: 0 | 1): void => {
  row.font = { bold: true }
  row.outlineLevel = level
  if (level === 0) {
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  }
}

// Sub-process row: deepest outline level, cost with 6 decimals (as in the UI)
const detailRow = (row: ExcelJS.Row): void => {
  row.outlineLevel = 2
  row.getCell('total_cost').numFmt = FMT_COST_DETAIL
}

// Bold frozen header; no auto filter (filtering would hide the total rows)
const finishGroupedSheet = (sheet: ExcelJS.Worksheet): void => {
  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  // Tell Excel how deep the row grouping goes (total → process → sub-process);
  // without this Excel can attach / hide sub-process rows under the wrong total.
  sheet.properties.outlineLevelRow = 2
}

// Report_<export date-time in IST>.xlsx, e.g. Report_20261014_153045.xlsx
const buildFileName = (): string => {
  const d = nowInIst()
  const p = (n: number): string => String(n).padStart(2, '0')
  const date = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`
  const time = `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  return `Report_${date}_${time}.xlsx`
}

async function buildAiUsageWorkbook(data: ExportData, query: AiUsageJdsQueryDto): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()

  // ── Sheet 1: Summary — search parameters, then totals ──
  const summary = wb.addWorksheet('Summary')
  summary.columns = [{ width: 22 }, { width: 50 }]
  const title = summary.addRow(['AI Usage Report'])
  title.font = { bold: true, size: 14 }
  summary.addRow([])
  summary.addRow(['Search Parameters']).font = { bold: true }
  const fromRow = summary.addRow(['Start Date', toExcelDate(query.from_date)])
  fromRow.getCell(2).numFmt = FMT_DATE
  const toRow = summary.addRow(['End Date', toExcelDate(query.to_date)])
  toRow.getCell(2).numFmt = FMT_DATE
  summary.addRow(['JD Name', data.filters.jd_names.join(', ')])
  summary.addRow(['Created By', data.filters.created_by ?? ''])
  const createdRow = summary.addRow(['Created Date', nowInIst()])
  createdRow.getCell(2).numFmt = FMT_DATETIME
  summary.addRow([])
  summary.addRow(['Totals']).font = { bold: true }
  const s = data.summary
  const totals: Array<[string, number, string]> = [
    ['Total JDs', toNumber(s.total_jds), FMT_INT],
    ['Total Candidates', toNumber(s.total_candidates), FMT_INT],
    ['Calls', toNumber(s.calls), FMT_INT],
    ['Failed', toNumber(s.failed_calls), FMT_INT],
    ['Input Tokens', toNumber(s.input_tokens), FMT_INT],
    ['Output Tokens', toNumber(s.output_tokens), FMT_INT],
    ['Total Tokens', toNumber(s.total_tokens), FMT_INT],
    ['Total Cost ($)', toNumber(s.total_cost), FMT_COST],
  ]
  for (const [label, value, fmt] of totals) {
    const row = summary.addRow([label, value])
    row.getCell(2).numFmt = fmt
    row.getCell(2).alignment = { horizontal: 'left' }
  }
  summary.getColumn(1).font = { bold: true }

  // ── Sheet 2: JDs ──
  const jds = wb.addWorksheet('JDs')
  jds.columns = [
    { header: 'JD Name', key: 'jd_name', width: 32 },
    { header: 'Created Date', key: 'created_date', width: 14, style: { numFmt: FMT_DATE } },
    { header: 'Candidates', key: 'candidate_count', width: 12, style: { numFmt: FMT_INT } },
    ...usageColumns,
  ]
  for (const j of data.jds) {
    jds.addRow({
      jd_name: j.jd_name ?? '',
      created_date: toExcelDate(j.created_date),
      candidate_count: toNumber(j.candidate_count),
      ...usageValues(j),
    })
  }
  finishTableSheet(jds)

  // ── Sheet 3: JD Processes — JD total → main process total → sub-processes ──
  const proc = wb.addWorksheet('JD Processes', { properties: { outlineProperties: { summaryBelow: false, summaryRight: false } } })
  proc.columns = [
    { header: 'JD Name', key: 'jd_name', width: 32 },
    { header: 'Process', key: 'module', width: 22 },
    { header: 'Sub-process', key: 'feature', width: 36 },
    ...usageColumns,
  ]
  for (const [, jdRows] of groupRows(data.jd_processes, (p) => String(p.jd_id))) {
    styleTotalRow(proc.addRow({ jd_name: jdRows[0].jd_name ?? '', ...sumUsage(jdRows) }), 0)
    for (const [module, modRows] of groupRows(jdRows, (p) => p.module)) {
      styleTotalRow(proc.addRow({ module: toLabel(module), ...sumUsage(modRows) }), 1)
      for (const p of modRows) {
        detailRow(proc.addRow({ feature: toLabel(p.feature), ...usageValues(p) }))
      }
    }
  }
  finishGroupedSheet(proc)

  // ── Sheet 4: Candidates — candidate total → main process total → sub-processes ──
  const cand = wb.addWorksheet('Candidates', { properties: { outlineProperties: { summaryBelow: false, summaryRight: false } } })
  cand.columns = [
    { header: 'JD Name', key: 'jd_name', width: 32 },
    { header: 'Candidate Name', key: 'full_name', width: 30 },
    { header: 'Candidate IDs', key: 'candidate_ids', width: 16 },
    { header: 'Uploaded Date', key: 'uploaded_date', width: 14, style: { numFmt: FMT_DATE } },
    { header: 'Process', key: 'module', width: 22 },
    { header: 'Sub-process', key: 'feature', width: 36 },
    ...usageColumns,
  ]
  for (const [, candRows] of groupRows(data.candidates, (c) => `${c.jd_id}|${c.candidate_id}`)) {
    const c = candRows[0]
    styleTotalRow(cand.addRow({
      jd_name: c.jd_name ?? '',
      full_name: c.full_name ?? `Candidate #${c.candidate_id}`,
      candidate_ids: c.candidate_ids,
      uploaded_date: toExcelDate(c.uploaded_date),
      ...sumUsage(candRows),
    }), 0)
    for (const [module, modRows] of groupRows(candRows, (r) => r.module)) {
      styleTotalRow(cand.addRow({ module: toLabel(module), ...sumUsage(modRows) }), 1)
      for (const r of modRows) {
        detailRow(cand.addRow({ feature: toLabel(r.feature), ...usageValues(r) }))
      }
    }
  }
  finishGroupedSheet(cand)

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out as ArrayBuffer)
}

export const reportsService = {
  async getAiUsageJdDropdown(companyId: number) {
    return reportsRepository.getAiUsageJdDropdown(companyId)
  },

  async getAiUsageJds(companyId: number, query: AiUsageJdsQueryDto) {
    return reportsRepository.getAiUsageJds(
      companyId,
      query.from_date ?? null,
      query.to_date ?? null,
      query.jd_ids !== undefined && query.jd_ids.length > 0 ? query.jd_ids : null
    )
  },

  async getAiUsageJdProcesses(companyId: number, query: AiUsageJdProcessesQueryDto) {
    return reportsRepository.getAiUsageJdProcesses(
      companyId,
      query.unassigned ? null : query.jd_id ?? null,
      query.unassigned,
      query.from_date ?? null,
      query.to_date ?? null
    )
  },

  async getAiUsageJdCandidates(companyId: number, query: AiUsageJdCandidatesQueryDto) {
    return reportsRepository.getAiUsageJdCandidates(
      companyId,
      query.unassigned ? null : query.jd_id ?? null,
      query.unassigned,
      query.from_date ?? null,
      query.to_date ?? null,
      query.page,
      query.page_size
    )
  },

  async exportAiUsage(companyId: number, userId: number, query: AiUsageJdsQueryDto): Promise<AiUsageExportFile> {
    const data = (await reportsRepository.getAiUsageExport(
      companyId,
      userId,
      query.from_date ?? null,
      query.to_date ?? null,
      query.jd_ids !== undefined && query.jd_ids.length > 0 ? query.jd_ids : null
    )) as ExportData | null

    if (data == null) {
      throw new AppError('No report data found', 404)
    }

    const buffer = await buildAiUsageWorkbook(data, query)
    logger.info('AI usage report exported', { companyId, userId, jds: data.jds.length })
    return { buffer, fileName: buildFileName() }
  },
}
