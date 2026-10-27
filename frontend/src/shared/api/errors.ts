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

export class NetworkError extends Error {
  constructor(message = 'Não foi possível conectar à API.') {
    super(message)
    this.name = 'NetworkError'
  }
}

export class RequestTimeoutError extends NetworkError {
  constructor() {
    super('A API demorou mais que o limite configurado para responder.')
    this.name = 'RequestTimeoutError'
  }
}

export class RequestCancelledError extends NetworkError {
  constructor() {
    super('A requisição foi cancelada.')
    this.name = 'RequestCancelledError'
  }
}
