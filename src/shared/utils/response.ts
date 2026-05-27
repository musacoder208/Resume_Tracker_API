import { v4 as uuidv4 } from 'uuid'
import type { Response } from 'express'

interface ApiMeta {
  requestId: string
  timestamp: string
}

interface SendSuccessOptions<T> {
  code: string
  message: string
  data?: T
  statusCode?: number
  requestId?: string
}

interface SendErrorOptions {
  code: string
  message: string
  statusCode?: number
  requestId?: string
}

export function sendSuccess<T>(res: Response, options: SendSuccessOptions<T>): void {
  const { code, message, data, statusCode = 200, requestId } = options

  const meta: ApiMeta = {
    requestId: requestId ?? uuidv4(),
    timestamp: new Date().toISOString(),
  }

  const body: Record<string, unknown> = { success: true, code, message }

  if (data !== undefined) {
    body.data = data
  }

  body.meta = meta

  res.status(statusCode).json(body)
}

export function sendError(res: Response, options: SendErrorOptions): void {
  const { code, message, statusCode = 500, requestId } = options

  const meta: ApiMeta = {
    requestId: requestId ?? uuidv4(),
    timestamp: new Date().toISOString(),
  }

  res.status(statusCode).json({
    success: false,
    code,
    message,
    meta,
  })
}
