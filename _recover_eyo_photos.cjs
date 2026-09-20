/**
 * Recover EYO photos with span-aware drawing maps, upload new ones,
 * rewrite serials for shared ITEM NOs, and emit SQL fixes.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const XLSX = require('xlsx')
const { XMLParser } = require('fast-xml-parser')
const { createClient } = require('@supabase/supabase-js')

const ROOT = process.cwd()
const EXTRACT = path.join(ROOT, '_eyo_xlsx')
const OUT_IMG = path.join(ROOT, 'public', 'products', 'eyo')
const SKIP_UPLOAD = process.argv.includes('--sql-only')

function loadEnv() {
  const env = {}
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}
function uuidFrom(key) {
  const h = crypto.createHash('md5').update('vhm-eyo:' + key).digest()
  h[6] = (h[6] & 0x0f) | 0x40
  h[8] = (h[8] & 0x3f) | 0x80
  const hex = h.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
function cleanName(s) {
  return String(s || '')
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function safeFile(itemNo) {
  return String(itemNo)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
}
function asArray(x) {
  return !x ? [] : Array.isArray(x) ? x : [x]
}

const wb = XLSX.readFile(path.join(ROOT, 'DOSSIER 1 EYO.xlsx'))
const matrix = XLSX.utils.sheet_to_json(wb.Sheets.CI, { header: 1, defval: null, raw: true })
let headerIdx = -1
for (let i = 0; i < matrix.length; i++) {
  if (String((matrix[i] || [])[0] || '').trim().toUpperCase() === 'ITEM NO.') {
    headerIdx = i
    break
  }
}
const raw = []
for (let i = headerIdx + 1; i < matrix.length; i++) {
  const row = matrix[i] || []
  const itemNo = row[0] != null ? String(row[0]).trim() : ''
  const name = cleanName(row[2])
  const ctn = Number(row[3])
  const paquet = Number(row[5])
  const pcs = Number(row[6])
  if (!itemNo || !name || !(ctn > 0) || !(paquet > 0) || !(pcs > 0)) continue
  raw.push({ excelRow: i + 1, itemNo, name, ctn, paquet, pcs })
}
const counts = new Map()
for (const p of raw) counts.set(p.itemNo, (counts.get(p.itemNo) || 0) + 1)
const seen = new Map()
const products = raw.map((p) => {
  const total = counts.get(p.itemNo) || 1
  const occurrence = (seen.get(p.itemNo) || 0) + 1
  seen.set(p.itemNo, occurrence)
  const shared = total > 1
  const itemToken = p.itemNo.trim().toUpperCase().replace(/\s+/g, '-')
  const serialBase = shared && occurrence > 1 ? `${itemToken}-${occurrence}` : itemToken
  const fileBase = shared && occurrence > 1 ? `${safeFile(p.itemNo)}-${occurrence}` : safeFile(p.itemNo)
  const identityKey = shared
    ? `prod:${p.itemNo.toUpperCase()}:r${p.excelRow}`
    : `prod:${p.itemNo.toUpperCase()}`
  const oldSerialBase = shared ? `${itemToken}-R${p.excelRow}` : itemToken
  return {
    ...p,
    shared,
    occurrence,
    serialBase,
    fileBase,
    oldSerialBase,
    id: uuidFrom(identityKey),
  }
})

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
})
const drawing = parser.parse(
  fs.readFileSync(path.join(EXTRACT, 'xl/drawings/drawing1.xml'), 'utf8'),
)
const rels = parser.parse(
  fs.readFileSync(path.join(EXTRACT, 'xl/drawings/_rels/drawing1.xml.rels'), 'utf8'),
)
const relMap = new Map()
for (const r of asArray(rels.Relationships?.Relationship)) relMap.set(r['@_Id'], r['@_Target'])
const wsDr = drawing.wsDr || drawing
const anchors = [...asArray(wsDr.twoCellAnchor), ...asArray(wsDr.oneCellAnchor)]
const rowToMedia = new Map()
const rowSpan = new Map()
for (const a of anchors) {
  const from = a.from
  if (!from) continue
  const rowFrom = Number(from.row)
  if (!Number.isFinite(rowFrom)) continue
  const rowTo = Number(a.to?.row)
  const rowEnd = Number.isFinite(rowTo) ? Math.max(rowFrom, rowTo) : rowFrom
  const blip = a.pic?.blipFill?.blip
  const rid =
    blip?.['@_r:embed'] ||
    blip?.['@_embed'] ||
    (blip && Object.entries(blip).find(([k]) => k.toLowerCase().includes('embed'))?.[1])
  if (!rid) continue
  const target = relMap.get(rid)
  if (!target) continue
  const media = target.replace(/^\.\.\//, 'xl/')
  const span = rowEnd - rowFrom
  for (let r = rowFrom; r <= rowEnd; r++) {
    const prev = rowSpan.get(r)
    if (prev == null || span < prev) {
      rowToMedia.set(r, media)
      rowSpan.set(r, span)
    }
  }
}
console.log('span-aware mappings', rowToMedia.size)

fs.mkdirSync(OUT_IMG, { recursive: true })
let copied = 0
const stillMissing = []
const usedNeighbor = []
for (const p of products) {
  const row0 = p.excelRow - 1
  let mediaRel = rowToMedia.get(row0)
  let viaNeighbor = false
  // Prefer exact row, then nearest drawing within ±3 (Excel packing gaps)
  if (!mediaRel) {
    for (const off of [-1, 1, -2, 2, -3, 3]) {
      if (rowToMedia.has(row0 + off)) {
        mediaRel = rowToMedia.get(row0 + off)
        viaNeighbor = true
        break
      }
    }
  }
  if (!mediaRel) {
    stillMissing.push(p)
    p.localFile = null
    p.storageExt = null
    continue
  }
  const src = path.join(EXTRACT, mediaRel.replace(/\//g, path.sep))
  if (!fs.existsSync(src)) {
    stillMissing.push(p)
    p.localFile = null
    p.storageExt = null
    continue
  }
  const ext = path.extname(src).toLowerCase() || '.jpg'
  const destName = p.fileBase + ext
  const dest = path.join(OUT_IMG, destName)
  fs.copyFileSync(src, dest)
  p.localFile = destName
  p.storageExt = (ext === '.jpeg' ? '.jpg' : ext).replace('.', '')
  if (viaNeighbor) usedNeighbor.push(`${p.itemNo}@${p.excelRow}`)
  copied++
}
console.log('copied', copied, 'stillMissing', stillMissing.length, 'neighbor', usedNeighbor.length)
if (stillMissing.length) {
  console.log(
    'no photo rows:',
    stillMissing.map((p) => `${p.itemNo}@${p.excelRow}`).join(', '),
  )
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function urlExists(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(8000),
    })
    return res.ok || res.status === 206
  } catch {
    return false
  }
}

async function main() {
  const env = loadEnv()
  const base = env.VITE_SUPABASE_URL.replace(/\/$/, '')
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
  const sb = createClient(base, key, { auth: { persistSession: false } })

  const photoUpdates = []
  let ok = 0
  let fail = 0
  let skippedExisting = 0

  for (const p of products) {
    if (!p.localFile || !p.storageExt) continue
    const storagePath = `eyo/${p.id}.${p.storageExt}`
    const { data } = sb.storage.from('product-photos').getPublicUrl(storagePath)
    const publicUrl = data.publicUrl

    if (!SKIP_UPLOAD) {
      // Upsert everything — update policy is open; skip per-file existence probes.
      const local = path.join(OUT_IMG, p.localFile)
      const mime =
        p.storageExt === 'jpg' || p.storageExt === 'jpeg'
          ? 'image/jpeg'
          : p.storageExt === 'webp'
            ? 'image/webp'
            : 'image/png'
      const buf = fs.readFileSync(local)
      let uploaded = false
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { error } = await sb.storage.from('product-photos').upload(storagePath, buf, {
          contentType: mime,
          upsert: true,
          cacheControl: '31536000',
        })
        if (!error) {
          uploaded = true
          break
        }
        console.error('upload fail', p.localFile, attempt, error.message)
        await sleep(400 * attempt)
      }
      if (!uploaded) {
        fail++
        photoUpdates.push({ id: p.id, publicUrl, itemNo: p.itemNo, pendingUpload: true })
        continue
      }
      ok++
      if (ok % 25 === 0) console.log('uploaded', ok)
    }
    photoUpdates.push({ id: p.id, publicUrl, itemNo: p.itemNo })
  }
  console.log({
    uploaded: ok,
    fail,
    skippedExisting,
    photoUpdates: photoUpdates.length,
    sqlOnly: SKIP_UPLOAD,
  })

  const sql = []
  sql.push('-- EYO photo HTTPS URLs (span-aware) + serial rename for shared ITEM NOs')
  sql.push('-- Also re-opens then closes temporary Storage write policies.')
  sql.push('begin;')
  sql.push('')
  sql.push('-- 0) Ensure upload policies exist (idempotent) for any manual re-upload')
  sql.push('drop policy if exists product_photos_eyo_seed_insert on storage.objects;')
  sql.push(`create policy product_photos_eyo_seed_insert
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'product-photos' and name like 'eyo/%');`)
  sql.push('drop policy if exists product_photos_eyo_seed_update on storage.objects;')
  sql.push(`create policy product_photos_eyo_seed_update
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'product-photos' and name like 'eyo/%')
  with check (bucket_id = 'product-photos' and name like 'eyo/%');`)
  sql.push('drop policy if exists product_photos_eyo_seed_delete on storage.objects;')
  sql.push(`create policy product_photos_eyo_seed_delete
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'product-photos' and name like 'eyo/%');`)
  sql.push('')
  sql.push('-- 1) Photo URLs')
  for (const u of photoUpdates) {
    sql.push(
      `update public.products set photo_url = '${u.publicUrl.replace(/'/g, "''")}', updated_at = now() where id = '${u.id}'::uuid;`,
    )
  }
  sql.push('')
  sql.push('-- 2) Serial numbers for shared ITEM NOs: first keeps ITEM, later rows ITEM-2 / ITEM-3')
  for (const p of products) {
    if (p.oldSerialBase === p.serialBase && !p.shared) continue
    // Always rewrite shared products (old used -R{row}); also rewrite occurrence>1
    if (!p.shared) continue
    for (const [lvl, suf] of [
      [0, 'PCE'],
      [1, 'PKG'],
      [2, 'CTN'],
    ]) {
      sql.push(
        `update public.product_units set serial_number = '${p.serialBase}-${suf}', updated_at = now() where product_id = '${p.id}'::uuid and unit_level = ${lvl};`,
      )
    }
  }
  sql.push('')
  sql.push('-- 3) Close temporary Storage write policies')
  sql.push('drop policy if exists product_photos_eyo_seed_insert on storage.objects;')
  sql.push('drop policy if exists product_photos_eyo_seed_update on storage.objects;')
  sql.push('drop policy if exists product_photos_eyo_seed_delete on storage.objects;')
  sql.push('')
  sql.push('-- Products with no Excel drawing (no photo in dossier):')
  for (const p of stillMissing) {
    sql.push(`--   ${p.itemNo} row ${p.excelRow}: ${p.name}`)
  }
  sql.push('commit;')
  sql.push('')
  sql.push('select')
  sql.push("  'EYO PHOTO+SERIAL FIX OK' as status,")
  sql.push(
    `  (select count(*) from public.products where photo_url like '%/storage/v1/object/public/product-photos/eyo/%') as https_photos,`,
  )
  sql.push(
    `  (select count(*) from public.products where photo_url like '%/_missing.png' or photo_url like '/products/eyo/%') as local_or_missing,`,
  )
  sql.push(
    `  (select count(*) from public.product_units where serial_number ~ '-R[0-9]+-(PCE|PKG|CTN)$') as old_row_serials_left;`,
  )

  const out = path.join(ROOT, 'supabase', 'tests', 'eyo_recover_photos_and_serials.sql')
  fs.writeFileSync(out, sql.join('\n'), 'utf8')
  console.log('wrote', out, 'bytes', fs.statSync(out).size)

  const report = {
    products: products.length,
    copied,
    uploaded: ok,
    fail,
    skippedExisting,
    stillMissing: stillMissing.map((p) => ({
      itemNo: p.itemNo,
      excelRow: p.excelRow,
      name: p.name,
    })),
    usedNeighbor,
    sharedItemNos: products
      .filter((p) => p.shared)
      .map((p) => ({
        itemNo: p.itemNo,
        occurrence: p.occurrence,
        serialBase: p.serialBase,
        oldSerialBase: p.oldSerialBase,
        id: p.id,
        name: p.name,
      })),
  }
  fs.writeFileSync(
    path.join(ROOT, 'supabase', 'tests', 'eyo_photo_gap_report.json'),
    JSON.stringify(report, null, 2),
  )
  console.log('still missing count', stillMissing.length)
  console.log('shared ITEM NO products', report.sharedItemNos.length)
  if (fail > 0) {
    console.error(
      `\nUPLOAD BLOCKED (${fail}). Run supabase/tests/eyo_reopen_photo_upload.sql then: node _recover_eyo_photos.cjs`,
    )
    process.exitCode = 2
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
