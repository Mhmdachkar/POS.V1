#!/usr/bin/env node
/**
 * Client identity guard — blocks build and db push if this repo points at the wrong Supabase project or domain.
 * Never logs secret values (anon keys, passwords).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const identityPath = path.join(ROOT, 'scripts/client-identity.json')

function fail(message) {
  console.error(`\n[client-guard] ${message}\n`)
  process.exit(1)
}

function ok(message) {
  console.log(`[client-guard] OK: ${message}`)
}

function loadIdentity() {
  if (!fs.existsSync(identityPath)) {
    fail('missing scripts/client-identity.json (client-specific; keep merge=ours in .gitattributes).')
  }
  return JSON.parse(fs.readFileSync(identityPath, 'utf8'))
}

function extractRefFromSupabaseUrl(url) {
  const match = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)
  return match ? match[1] : null
}

function readEnvSupabaseUrl() {
  if (process.env.VITE_SUPABASE_URL) {
    return process.env.VITE_SUPABASE_URL.trim()
  }
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) return null
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || !trimmed.startsWith('VITE_SUPABASE_URL=')) continue
    return trimmed
      .slice('VITE_SUPABASE_URL='.length)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return null
}

function readConfigTomlProjectId() {
  const configPath = path.join(ROOT, 'supabase/config.toml')
  if (!fs.existsSync(configPath)) fail('missing supabase/config.toml')
  const text = fs.readFileSync(configPath, 'utf8')
  const match = text.match(/^\s*project_id\s*=\s*"([^"]+)"/m)
  return match ? match[1] : null
}

function readWranglerRoutePatterns() {
  const wranglerPath = path.join(ROOT, 'wrangler.jsonc')
  if (!fs.existsSync(wranglerPath)) return []
  const text = fs.readFileSync(wranglerPath, 'utf8')
  return [...text.matchAll(/"pattern"\s*:\s*"([^"]+)"/g)].map((m) => m[1])
}

function fileContainsRef(relativePath, ref) {
  const fullPath = path.join(ROOT, relativePath)
  if (!fs.existsSync(fullPath)) return false
  return fs.readFileSync(fullPath, 'utf8').includes(ref)
}

function domainMatchesPattern(domain, pattern) {
  return domain === pattern || domain.endsWith(`.${pattern}`)
}

function main() {
  const requireLinked = process.argv.includes('--require-linked')
  const id = loadIdentity()
  const {
    clientName,
    expectedSupabaseRef,
    primaryDomain,
    allowedRoutePatterns,
    otherSupabaseRef,
    otherDomains,
  } = id

  const projectId = readConfigTomlProjectId()
  if (projectId !== expectedSupabaseRef) {
    fail(
      `supabase/config.toml project_id "${projectId}" must be "${expectedSupabaseRef}" for ${clientName}.`,
    )
  }
  ok(`config.toml project_id ${projectId}`)

  if (fileContainsRef('supabase/config.toml', otherSupabaseRef)) {
    fail(`supabase/config.toml contains the other client's Supabase ref (${otherSupabaseRef}).`)
  }

  const routes = readWranglerRoutePatterns()
  for (const route of routes) {
    for (const otherDomain of otherDomains) {
      if (domainMatchesPattern(route, otherDomain)) {
        fail(
          `wrangler.jsonc route "${route}" belongs to the other client. ${clientName} must only use: ${allowedRoutePatterns.join(', ')}.`,
        )
      }
    }
    const allowed = allowedRoutePatterns.some((p) => domainMatchesPattern(route, p))
    if (!allowed) {
      fail(
        `wrangler.jsonc route "${route}" is not allowed for ${clientName}. Allowed: ${allowedRoutePatterns.join(', ')}.`,
      )
    }
  }
  ok(`wrangler routes (${routes.length})`)

  if (fileContainsRef('wrangler.jsonc', otherSupabaseRef)) {
    fail(`wrangler.jsonc contains the other client's Supabase ref (${otherSupabaseRef}).`)
  }

  const supabaseUrl = readEnvSupabaseUrl()
  if (supabaseUrl) {
    const ref = extractRefFromSupabaseUrl(supabaseUrl)
    if (!ref) {
      fail('VITE_SUPABASE_URL is set but is not a valid https://<ref>.supabase.co URL.')
    }
    if (ref === otherSupabaseRef) {
      fail(
        `VITE_SUPABASE_URL points at the other client's Supabase project (${otherSupabaseRef}). This repo is ${clientName} (${expectedSupabaseRef}).`,
      )
    }
    if (ref !== expectedSupabaseRef) {
      fail(
        `VITE_SUPABASE_URL ref "${ref}" does not match expected "${expectedSupabaseRef}" for ${clientName}.`,
      )
    }
    ok(`VITE_SUPABASE_URL ref ${ref}`)
  } else {
    console.log(
      '[client-guard] note: VITE_SUPABASE_URL not set (config.toml + wrangler still checked)',
    )
  }

  const linkedPath = path.join(ROOT, 'supabase/.temp/project-ref')
  if (fs.existsSync(linkedPath)) {
    const linked = fs.readFileSync(linkedPath, 'utf8').trim()
    if (linked === otherSupabaseRef) {
      fail(
        `Supabase CLI is linked to the other client (${otherSupabaseRef}). Run: supabase link --project-ref ${expectedSupabaseRef}`,
      )
    }
    if (linked !== expectedSupabaseRef) {
      fail(
        `Linked Supabase project "${linked}" does not match ${clientName} (expected ${expectedSupabaseRef}).`,
      )
    }
    ok(`linked project ref ${linked}`)
  } else if (requireLinked) {
    fail(
      `supabase/.temp/project-ref missing. Link this repo first: supabase link --project-ref ${expectedSupabaseRef}`,
    )
  }

  console.log(
    `\n[client-guard] Passed — ${clientName}, ref ${expectedSupabaseRef}, domain ${primaryDomain}\n`,
  )
}

main()
