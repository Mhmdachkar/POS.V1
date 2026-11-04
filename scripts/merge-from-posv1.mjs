#!/usr/bin/env node
/**
 * Merge shared features from POS.V1 (Aquilux) into this VHM-System clone safely.
 * Run only from the VHM repo folder — never from the Aquilux clone.
 *
 *   node scripts/merge-from-posv1.mjs           # checklist + dry-run checks
 *   node scripts/merge-from-posv1.mjs --execute   # fetch + merge posv1/main
 *
 * After merge: npm run check-client && npm run build && node scripts/verify-production-bundle.mjs
 * Push to origin master (not main). Never copy .env from Aquilux.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const identityPath = path.join(ROOT, 'scripts', 'client-identity.json')
const VHM_REF = 'slrakslfyxbihbivzrhn'
const execute = process.argv.includes('--execute')

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: opts.inherit ? 'inherit' : 'pipe', ...opts })
}

function fail(msg) {
  console.error(`\n[merge-from-posv1] ${msg}\n`)
  process.exit(1)
}

function loadIdentity() {
  if (!fs.existsSync(identityPath)) {
    fail('missing scripts/client-identity.json — are you in the VHM clone?')
  }
  return JSON.parse(fs.readFileSync(identityPath, 'utf8'))
}

const id = loadIdentity()
if (id.expectedSupabaseRef !== VHM_REF) {
  fail(
    `This script is for VHM-System only (expected ref ${VHM_REF}). ` +
      `This clone is "${id.clientName}" (${id.expectedSupabaseRef}). ` +
      'In Aquilux, merge from VHM with: git fetch origin master && git merge origin/master',
  )
}

let branch = ''
try {
  branch = run('git branch --show-current').trim()
} catch {
  fail('not a git repository')
}

if (branch !== 'master') {
  console.warn(`[merge-from-posv1] warning: current branch is "${branch}", not master (VHM production).`)
}

let oursDriver = ''
try {
  oursDriver = run('git config --get merge.ours.driver').trim()
} catch {
  /* unset */
}
if (oursDriver !== 'true') {
  fail(
    'Run once in this clone: git config merge.ours.driver true\n' +
      '(keeps VHM wrangler, config.toml, client-identity.json, index.html, etc. on merge)',
  )
}

let remotes = ''
try {
  remotes = run('git remote -v')
} catch {
  fail('git remote failed')
}
if (!remotes.includes('posv1')) {
  fail(
    'Add Aquilux remote:\n' +
      '  git remote add posv1 https://github.com/Mhmdachkar/POS.V1.git',
  )
}

console.log('[merge-from-posv1] Pre-flight OK for VHM clone.')
console.log('[merge-from-posv1] Client-specific files use merge=ours — they must stay VHM after merge.')
console.log('[merge-from-posv1] Never commit Aquilux Supabase ref, aquilux-pos.online routes, or Aquilux GitHub secrets.')

if (!execute) {
  console.log('\nDry run only. To merge POS.V1 main into this branch:')
  console.log('  node scripts/merge-from-posv1.mjs --execute')
  console.log('\nThen verify before push:')
  console.log('  npm run check-client')
  console.log('  npm run build')
  console.log('  node scripts/verify-production-bundle.mjs')
  console.log('  git push origin master')
  process.exit(0)
}

console.log('\n[merge-from-posv1] Fetching posv1/main …')
run('git fetch posv1 main', { inherit: true })

console.log('[merge-from-posv1] Merging posv1/main (client files should stay ours) …')
try {
  run('git merge posv1/main --no-edit', { inherit: true })
} catch {
  fail(
    'Merge stopped with conflicts. Resolve only shared src/ / tests / migrations.\n' +
      'Do NOT take Aquilux versions of wrangler.jsonc, config.toml, client-identity.json, index.html, CLIENT.md, deploy workflow.',
  )
}

console.log('\n[merge-from-posv1] Merge complete. Running client guard …')
run('npm run check-client', { inherit: true })

console.log('\n[merge-from-posv1] Next: npm run build && node scripts/verify-production-bundle.mjs')
console.log('[merge-from-posv1] Confirm GitHub secrets on VHM-System: VITE_SUPABASE_URL → slrak…, VITE_APP_NAME → VHM POS')
