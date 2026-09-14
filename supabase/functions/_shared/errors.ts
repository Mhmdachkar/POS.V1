import { jsonResponse } from './cors.ts'

export function errorResponse(
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    status,
  )
}

export function parseCallerRpcError(
  error: { message?: string; code?: string } | null,
): { code: string; message: string; details?: Record<string, unknown> } {
  const raw = error?.message ?? ''
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as {
        code?: string
        details?: Record<string, unknown>
        message?: string
      }
      if (parsed.code) {
        return {
          code: parsed.code,
          message: parsed.message ?? parsed.code,
          details: parsed.details,
        }
      }
    } catch {
      // fall through
    }
  }
  return { code: 'UNKNOWN', message: raw || 'Unexpected error.' }
}

export function rpcErrorStatus(code: string): number {
  if (code === 'UNAUTHORIZED') return 403
  if (code === 'AUTH_SYNC_FAILED') return 409
  return 400
}
