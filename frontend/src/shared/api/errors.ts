export type ApiErrorPayload = {
  code: string
  message: string
  details?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message)
    this.name = 'ApiError'
    this.status = status
    this.code = payload.code
    this.details = payload.details
  }
}

export class UnauthorizedError extends ApiError {
  constructor(payload: ApiErrorPayload) {
    super(401, payload)
    this.name = 'UnauthorizedError'
  }
}
