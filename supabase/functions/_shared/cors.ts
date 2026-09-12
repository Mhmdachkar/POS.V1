/**
 * CORS headers for VHM POS Edge Functions.
 *
 * In production, replace the wildcard origin with the actual
 * frontend domain (e.g. https://pos.vhm.example.com).
 *
 * The Authorization header must be included so that the JWT Bearer
 * token passes through from the Supabase client.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const

/**
 * Returns a 204 response for CORS preflight OPTIONS requests.
 * Must be the first check in every Edge Function handler.
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }
  return null
}

/** Convenience: wrap a JSON body with CORS headers. */
export function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
