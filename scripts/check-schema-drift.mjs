import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase', 'migrations')

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql') && !name.startsWith('_'))
  .sort()

const versions = files.map((name) => name.split('_')[0])
const dupes = versions.filter((v, i) => versions.indexOf(v) !== i)
const failures = []

if (dupes.length) {
  failures.push(`duplicate migration versions: ${[...new Set(dupes)].join(', ')}`)
}

const timestamp = /^\d{14}$/
for (const version of versions) {
  if (!timestamp.test(version)) {
    failures.push(`migration version is not YYYYMMDDHHMMSS: ${version}`)
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(`Schema migration guard ok (${files.length} local files, latest ${files.at(-1)})`)

const token = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = process.env.SUPABASE_PROJECT_REF
if (!token || !projectRef) {
  console.log('Remote compare skipped (set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF).')
  process.exit(0)
}

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'select version from supabase_migrations.schema_migrations order by version',
  }),
})

if (!res.ok) {
  console.error(`Remote migration query failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}

const remoteRows = await res.json()
const remote = new Set(
  (Array.isArray(remoteRows) ? remoteRows : []).map((row) => String(row.version ?? row.VERSION ?? '')),
)
const missing = versions.filter((v) => !remote.has(v))
if (missing.length) {
  console.error(`Production missing migrations:\n${missing.join('\n')}`)
  process.exit(1)
}

console.log(`Remote schema matches local (${remote.size} applied).`)
