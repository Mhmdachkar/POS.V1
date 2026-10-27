import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase', 'migrations')
const catalogSource = readFileSync(join(root, 'src/lib/rpcSignatures.ts'), 'utf8')
const rpcSource = readFileSync(join(root, 'src/lib/rpc.ts'), 'utf8')
const typesSource = readFileSync(join(root, 'src/types/database.ts'), 'utf8')

const catalog = {}
for (const match of catalogSource.matchAll(/^\s{2}([a-z][a-z0-9_]*)\s*:\s*\[([^\]]*)\]/gm)) {
  catalog[match[1]] = match[2]
    .split(',')
    .map((part) => part.trim().replace(/['"]/g, ''))
    .filter(Boolean)
}

const sqlNames = new Set()
const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
for (const file of files) {
  const text = readFileSync(join(migrationsDir, file), 'utf8')
  const pattern = /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+(?:public\.)?([a-z][a-z0-9_]*)\s*\(/gi
  for (const match of text.matchAll(pattern)) {
    sqlNames.add(match[1])
  }
}

const failures = []
for (const name of Object.keys(catalog)) {
  if (!sqlNames.has(name)) failures.push(`${name}: missing from latest migrations`)
}

for (const match of rpcSource.matchAll(/callRpc(?:<[^>]+>)?\(\s*'([a-z][a-z0-9_]*)'/g)) {
  if (!(match[1] in catalog)) failures.push(`rpc.ts calls uncatalogued ${match[1]}`)
}

if (!/Functions[\s\S]*admin_report_sales/.test(typesSource)) {
  failures.push('src/types/database.ts Functions is missing admin_report_sales')
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(`RPC signature guard ok (${Object.keys(catalog).length} functions)`)
