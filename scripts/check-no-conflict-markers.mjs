#!/usr/bin/env node
/**
 * Fail fast if Git conflict markers are present in source.
 * Catches unfinished merges before Vite/esbuild try to parse them.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const mergeInProgress =
  existsSync(join(root, '.git', 'MERGE_HEAD')) ||
  existsSync(join(root, '.git', 'REBASE_HEAD'))

const pattern = '^(<<<<<<<|=======|>>>>>>>)'
const globs = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs', '*.json', '*.css', '*.md', '*.sql']

let out = ''
try {
  out = execFileSync(
    'git',
    ['grep', '-nE', pattern, '--', ...globs],
    { encoding: 'utf8', cwd: root },
  ).trim()
} catch (err) {
  const status = typeof err.status === 'number' ? err.status : null
  out = String(err.stdout ?? '').trim()
  // git grep: 0 = matches (unusual with throw), 1 = no matches
  if (status !== 1 && status !== 0 && !out) {
    console.error('check-no-conflict-markers: git grep failed:', err.message ?? err)
    process.exit(1)
  }
}

if (out) {
  console.error('Conflict markers found in the working tree:\n')
  console.error(out)
  console.error('\nResolve (or abort) the merge/rebase before building or running Vite.')
  process.exit(1)
}

if (mergeInProgress) {
  console.error('A Git merge/rebase is still in progress (.git/MERGE_HEAD or REBASE_HEAD).')
  console.error('Finish or abort it before building or running Vite.')
  process.exit(1)
}

console.log('No conflict markers.')