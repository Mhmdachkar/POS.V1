/**
 * Shared QA auth helpers - passwords come only from environment / .env.
 * Never commit real credentials; scripts fail closed if vars are missing.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export function loadDotEnv(file = '.env') {
  const path = resolve(process.cwd(), file)
  if (!existsSync(path)) return {}
  const raw = readFileSync(path, 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

export function requireVar(env, name) {
  const value = env[name] || process.env[name]
  if (!value) {
    console.error('Missing required env: ' + name)
    process.exit(1)
  }
  return value
}

export function supabaseAnon(env = loadDotEnv()) {
  const url = requireVar(env, 'VITE_SUPABASE_URL')
  const anon = requireVar(env, 'VITE_SUPABASE_ANON_KEY')
  return { url, anon, env }
}

/** Prefer specific name, then shared QA_* fallbacks. Fail closed - no hardcoded defaults. */
export function requirePassword(env, ...names) {
  for (const name of names) {
    const value = env[name] || process.env[name]
    if (value) return value
  }
  console.error('Missing required password env (tried: ' + names.join(', ') + ')')
  process.exit(1)
}

export async function signInWithPassword(url, anon, email, password) {
  const root = createClient(url, anon, { auth: { persistSession: false } })
  const { data, error } = await root.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw error ?? new Error('sign-in failed for ' + email)
  }
  return createClient(url, anon, {
    global: { headers: { Authorization: 'Bearer ' + data.session.access_token } },
    auth: { persistSession: false },
  })
}