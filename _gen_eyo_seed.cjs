/**
 * Generate EYO dossier catalog migration + extract product photos.
 *
 * Prerequisites:
 *   1. DOSSIER 1 EYO.xlsx in repo root
 *   2. Extracted workbook at _eyo_xlsx/ (copy xlsx to .zip and Expand-Archive)
 *
 * Usage: node _gen_eyo_seed.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { XMLParser } = require('fast-xml-parser');

const ROOT = process.cwd();
const XLSX_PATH = path.join(ROOT, 'DOSSIER 1 EYO.xlsx');
const EXTRACT = path.join(ROOT, '_eyo_xlsx');
const OUT_IMG = path.join(ROOT, 'public', 'products', 'eyo');
const OUT_SQL = path.join(
  ROOT,
  'supabase',
  'migrations',
  '20261001120000_seed_eyo_dossier1_catalog.sql',
);
const OLD_SQL = path.join(
  ROOT,
  'supabase',
  'migrations',
  '20260919120000_seed_eyo_dossier1_catalog.sql',
);

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function cleanName(s) {
  return String(s || '')
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeFile(itemNo) {
  return String(itemNo).trim().replace(/[^A-Za-z0-9._-]+/g, '_');
}

function titleCaseCategory(s) {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return 'Divers';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function uuidFrom(key) {
  const h = crypto.createHash('md5').update('vhm-eyo:' + key).digest();
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.toString('hex');
  return (
    hex.slice(0, 8) +
    '-' +
    hex.slice(8, 12) +
    '-' +
    hex.slice(12, 16) +
    '-' +
    hex.slice(16, 20) +
    '-' +
    hex.slice(20, 32)
  );
}

function asArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

// --- Parse worksheet rows ---
const wb = XLSX.readFile(XLSX_PATH, { cellDates: true });
const ws = wb.Sheets['CI'];
if (!ws) throw new Error('Sheet CI not found');
const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

let headerIdx = -1;
for (let i = 0; i < matrix.length; i++) {
  const row = matrix[i] || [];
  if (String(row[0] || '').trim().toUpperCase() === 'ITEM NO.') {
    headerIdx = i;
    break;
  }
}
if (headerIdx < 0) throw new Error('Header row not found');

const rawProducts = [];
for (let i = headerIdx + 1; i < matrix.length; i++) {
  const row = matrix[i] || [];
  const itemNo = row[0] != null ? String(row[0]).trim() : '';
  const name = cleanName(row[2]);
  const ctn = Number(row[3]);
  const category = titleCaseCategory(row[4]);
  const paquet = Number(row[5]);
  const pcsPerPq = Number(row[6]);
  if (!itemNo || !name) continue;
  if (!(ctn > 0) || !(paquet > 0) || !(pcsPerPq > 0)) {
    console.warn('skip bad qty', itemNo, ctn, paquet, pcsPerPq);
    continue;
  }
  rawProducts.push({
    excelRow: i + 1,
    itemNo,
    name,
    ctn,
    category,
    paquet,
    pcsPerPq,
    piecesPerCarton: paquet * pcsPerPq,
    stockPieces: ctn * paquet * pcsPerPq,
  });
}

// Shared ITEM NO. values are still distinct products (different names/rows).
// Keep stable UUIDs per excel row; serials stay searchable by the raw ITEM NO.
const itemCounts = new Map();
for (const p of rawProducts) {
  itemCounts.set(p.itemNo, (itemCounts.get(p.itemNo) || 0) + 1);
}
const itemSeen = new Map();
const products = rawProducts.map((p) => {
  const total = itemCounts.get(p.itemNo) || 1;
  const seen = (itemSeen.get(p.itemNo) || 0) + 1;
  itemSeen.set(p.itemNo, seen);
  const sharedItemNo = total > 1;
  const itemToken = p.itemNo.trim().toUpperCase().replace(/\s+/g, '-');
  // First row keeps plain ITEM; later rows with same ITEM get ITEM-2, ITEM-3, …
  const serialBase = sharedItemNo && seen > 1 ? `${itemToken}-${seen}` : itemToken;
  const fileBase =
    sharedItemNo && seen > 1 ? `${safeFile(p.itemNo)}-${seen}` : safeFile(p.itemNo);
  // UUID always includes excel row when ITEM NO is reused so both products exist
  const identityKey = sharedItemNo
    ? `prod:${p.itemNo.toUpperCase()}:r${p.excelRow}`
    : `prod:${p.itemNo.toUpperCase()}`;
  return {
    ...p,
    sharedItemNo,
    occurrence: seen,
    serialBase,
    fileBase,
    identityKey,
  };
});

console.log(
  'products',
  products.length,
  'unique item nos',
  itemCounts.size,
  'shared-item-no rows',
  products.filter((p) => p.sharedItemNo).length,
);

// --- Map drawing images to rows ---
const drawingPath = path.join(EXTRACT, 'xl', 'drawings', 'drawing1.xml');
const relsPath = path.join(EXTRACT, 'xl', 'drawings', '_rels', 'drawing1.xml.rels');
if (!fs.existsSync(drawingPath)) {
  throw new Error('drawing1.xml missing — extract xlsx to _eyo_xlsx/ first');
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});
const drawing = parser.parse(fs.readFileSync(drawingPath, 'utf8'));
const rels = parser.parse(fs.readFileSync(relsPath, 'utf8'));

const relMap = new Map();
for (const r of asArray(rels.Relationships?.Relationship)) {
  relMap.set(r['@_Id'], r['@_Target']);
}

const wsDr = drawing.wsDr || drawing;
const anchors = [...asArray(wsDr.twoCellAnchor), ...asArray(wsDr.oneCellAnchor)];

const rowToMedia = new Map();
const rowSpan = new Map(); // prefer tighter spans when a row is covered by multiple anchors
for (const a of anchors) {
  const from = a.from;
  if (!from) continue;
  const rowFrom = Number(from.row);
  if (!Number.isFinite(rowFrom)) continue;
  const rowTo = Number(a.to?.row);
  const rowEnd = Number.isFinite(rowTo) ? Math.max(rowFrom, rowTo) : rowFrom;
  const blip = a.pic?.blipFill?.blip;
  const rid =
    blip?.['@_r:embed'] ||
    blip?.['@_embed'] ||
    (blip && Object.entries(blip).find(([k]) => k.toLowerCase().includes('embed'))?.[1]);
  if (!rid) continue;
  const target = relMap.get(rid);
  if (!target) continue;
  const media = target.replace(/^\.\.\//, 'xl/');
  const span = rowEnd - rowFrom;
  for (let r = rowFrom; r <= rowEnd; r++) {
    const prevSpan = rowSpan.get(r);
    if (prevSpan == null || span < prevSpan) {
      rowToMedia.set(r, media);
      rowSpan.set(r, span);
    }
  }
}
console.log('image row mappings (span-aware)', rowToMedia.size);

ensureDir(OUT_IMG);
// Clear previous product images (keep regenerating clean)
for (const f of fs.readdirSync(OUT_IMG)) {
  fs.unlinkSync(path.join(OUT_IMG, f));
}

let copied = 0;
let missingImg = 0;
for (const p of products) {
  const row0 = p.excelRow - 1;
  const mediaRel = rowToMedia.get(row0);
  let destRel = null;
  if (mediaRel) {
    const src = path.join(EXTRACT, mediaRel.replace(/\//g, path.sep));
    if (fs.existsSync(src)) {
      const ext = path.extname(src).toLowerCase() || '.jpg';
      const destName = p.fileBase + ext;
      fs.copyFileSync(src, path.join(OUT_IMG, destName));
      destRel = '/products/eyo/' + destName;
      copied++;
    } else {
      missingImg++;
    }
  } else {
    missingImg++;
  }
  p.photoUrl = destRel;
}
console.log('copied images', copied, 'missing', missingImg);

const FALLBACK = '/products/eyo/_missing.png';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII=',
  'base64',
);
fs.writeFileSync(path.join(OUT_IMG, '_missing.png'), png);
for (const p of products) {
  if (!p.photoUrl) p.photoUrl = FALLBACK;
}

const categories = [...new Set(products.map((p) => p.category))].sort();
console.log('categories', categories);

// Excel sheet spellings -> aliases that may already exist on Admin → Categories.
// Migration LOOKS UP existing categories; it does NOT insert new ones.
const CATEGORY_ALIASES = {
  clef: ['clef', 'clefs', 'cle', 'cles'],
  electrecite: ['electrecite', 'electricite', 'electricit'],
  minuserie: ['minuserie', 'menuserie'],
  outils: ['outils'],
  plomberie: ['plomberie'],
};

const ACCENT_FROM =
  'àâäáãåāăąèéêëēĕėęěìíîïĩīĭįıòóôöõøōŏőùúûüũūŭůűųýÿŷçćčñńņňÀÂÄÁÃÅĀĂĄÈÉÊËĒĔĖĘĚÌÍÎÏĨĪĬĮİÒÓÔÖÕØŌŎŐÙÚÛÜŨŪŬŮŰŲÝŸŶÇĆČÑŃŅŇ';
const ACCENT_TO =
  'aaaaaaaaaeeeeeeeeeeeiiiiiiiiiooooooooouuuuuuuuuuyyycsccnnnAAAAAAAAAEEEEEEEEEEEIIIIIIIIIOOOOOOOOOUUUUUUUUUUYYYCSCCNNN';

const lines = [];
lines.push('-- ================================================================');
lines.push('-- VHM POS — Seed catalog from DOSSIER 1 EYO.xlsx (sheet CI)');
lines.push('-- ================================================================');
lines.push('--');
lines.push('-- Unit logic:');
lines.push('--   pcs/pq  = pieces per package (L1 relative_quantity)');
lines.push('--   paquet  = packages per carton (L2 relative_quantity)');
lines.push('--   CTN     = opening stock in cartons');
lines.push('--   stock_pieces = CTN * paquet * pcs/pq');
lines.push('--');
lines.push('-- Example (JK-1): 30 CTN x 20 paquet x 12 pcs = 7200 pieces');
lines.push('--');
lines.push('-- Categories: RESOLVED from existing admin categories (no inserts).');
lines.push('-- Excel typos mapped: minuserie→menuserie, electrecite→electricite, etc.');
lines.push('-- Photos: uploaded to Supabase Storage as HTTPS (see _upload_eyo_photos.cjs).');
lines.push('-- Depot: prefers Abidjan (ABJ); never Dakar (DKR).');
lines.push('-- Prices: cost=0, selling=1 CFA placeholder — update in Inventory.');
lines.push('-- Idempotent: fixed UUIDs from item numbers (+ excel row for dups).');
lines.push('-- Must run AFTER product_units serial/hierarchy migrations.');
lines.push('-- NOT for re-running on a DB that already has live sales against these IDs.');
lines.push('-- ================================================================');
lines.push('');
lines.push('do $$');
lines.push('declare');
lines.push('  v_depot_id uuid;');
lines.push('  v_admin_id uuid;');
lines.push('  v_cat_id uuid;');
lines.push('  v_product_id uuid;');
lines.push('  v_stock numeric;');
lines.push('  v_pcs_per_pkg numeric;');
lines.push('  v_pkg_per_ctn numeric;');
lines.push('  v_pcs_per_ctn numeric;');
lines.push('  v_entry_id uuid;');
lines.push('  v_excel_key text;');
lines.push('  v_stem text;');
lines.push('  v_missing text;');
lines.push('  v_available text;');
lines.push('begin');
lines.push('  select id into v_depot_id');
lines.push('  from public.depots');
lines.push('  where is_active = true');
lines.push("  order by case");
lines.push("    when upper(code) = 'ABJ' then 0");
lines.push("    when lower(name) like '%abidjan%' then 1");
lines.push("    when upper(code) = 'DKR' then 90");
lines.push("    when lower(name) like '%dakar%' then 91");
lines.push('    else 50');
lines.push('  end, name');
lines.push('  limit 1;');
lines.push('');
lines.push('  if v_depot_id is null then');
lines.push("    raise exception 'EYO seed: no active depot found';");
lines.push('  end if;');
lines.push('');
lines.push('  -- Refuse to seed onto Dakar');
lines.push('  if exists (');
lines.push('    select 1 from public.depots d');
lines.push("    where d.id = v_depot_id");
lines.push("      and (upper(d.code) = 'DKR' or lower(d.name) like '%dakar%')");
lines.push('  ) then');
lines.push("    raise exception 'EYO seed: refused to use Dakar depot — activate Abidjan (ABJ) first';");
lines.push('  end if;');
lines.push('');
lines.push('  select id into v_admin_id');
lines.push('  from public.staff');
lines.push("  where role = 'admin' and is_active = true");
lines.push('  order by created_at');
lines.push('  limit 1;');
lines.push('');
lines.push('  if v_admin_id is null then');
lines.push("    raise exception 'EYO seed: no active admin staff found';");
lines.push('  end if;');
lines.push('');
lines.push('  -- Map Excel category labels onto EXISTING admin categories (do not create).');
lines.push('  create temporary table eyo_cat_alias (');
lines.push('    excel_key text not null,');
lines.push('    alias_norm text not null');
lines.push('  ) on commit drop;');
lines.push('');
lines.push('  create temporary table eyo_cat_map (');
lines.push('    excel_key text primary key,');
lines.push('    category_id uuid not null,');
lines.push('    matched_name text not null');
lines.push('  ) on commit drop;');
lines.push('');

for (const keyRaw of categories) {
  const key = keyRaw.toLowerCase();
  const aliases = CATEGORY_ALIASES[key] || [key];
  const uniq = [...new Set([key, ...aliases].map((a) => a.toLowerCase()))];
  for (const a of uniq) {
    lines.push(
      `  insert into eyo_cat_alias (excel_key, alias_norm) values (${sqlStr(key)}, ${sqlStr(a)});`,
    );
  }
}

lines.push('');
lines.push('  -- Exact / alias match on active root categories (accent-insensitive)');
lines.push('  insert into eyo_cat_map (excel_key, category_id, matched_name)');
lines.push('  select distinct on (a.excel_key)');
lines.push('    a.excel_key,');
lines.push('    c.id,');
lines.push('    c.name');
lines.push('  from eyo_cat_alias a');
lines.push('  join public.categories c');
lines.push('    on c.is_active = true');
lines.push('   and c.parent_id is null');
lines.push(
  `   and lower(translate(trim(c.name), '${ACCENT_FROM}', '${ACCENT_TO}')) = a.alias_norm`,
);
lines.push('  order by a.excel_key, length(c.name), c.created_at;');
lines.push('');
lines.push('  -- Fuzzy contains fallback for unresolved excel keys');
lines.push('  for v_excel_key in');
lines.push('    select distinct excel_key from eyo_cat_alias');
lines.push('    except');
lines.push('    select excel_key from eyo_cat_map');
lines.push('  loop');
lines.push('    insert into eyo_cat_map (excel_key, category_id, matched_name)');
lines.push('    select v_excel_key, c.id, c.name');
lines.push('    from public.categories c');
lines.push('    where c.is_active = true');
lines.push('      and c.parent_id is null');
lines.push(
  `      and lower(translate(trim(c.name), '${ACCENT_FROM}', '${ACCENT_TO}')) like '%' || v_excel_key || '%'`,
);
lines.push('    order by length(c.name), c.created_at');
lines.push('    limit 1');
lines.push('    on conflict (excel_key) do nothing;');
lines.push('  end loop;');
lines.push('');
lines.push('  -- Excel typos: electrecite↔electric*, minuserie↔menu*');
lines.push('  for v_excel_key, v_stem in');
lines.push('    select * from (values');
lines.push("      ('electrecite', 'electric'),");
lines.push("      ('minuserie', 'menu')");
lines.push('    ) as t(excel_key, stem)');
lines.push('  loop');
lines.push('    if exists (select 1 from eyo_cat_map where excel_key = v_excel_key) then');
lines.push('      continue;');
lines.push('    end if;');
lines.push('    insert into eyo_cat_map (excel_key, category_id, matched_name)');
lines.push('    select v_excel_key, c.id, c.name');
lines.push('    from public.categories c');
lines.push('    where c.is_active = true');
lines.push('      and c.parent_id is null');
lines.push(
  `      and lower(translate(trim(c.name), '${ACCENT_FROM}', '${ACCENT_TO}')) like '%' || v_stem || '%'`,
);
lines.push('    order by length(c.name), c.created_at');
lines.push('    limit 1');
lines.push('    on conflict (excel_key) do nothing;');
lines.push('  end loop;');
lines.push('');
lines.push('  select string_agg(excel_key, \', \' order by excel_key) into v_missing');
lines.push('  from (');
lines.push('    select distinct excel_key from eyo_cat_alias');
lines.push('    except');
lines.push('    select excel_key from eyo_cat_map');
lines.push('  ) miss;');
lines.push('');
lines.push('  if v_missing is not null then');
lines.push("    select string_agg(name, ', ' order by name) into v_available");
lines.push('    from public.categories');
lines.push('    where is_active = true and parent_id is null;');
lines.push('    raise exception');
lines.push(
  "      'EYO seed: missing admin categories for Excel labels: %. Available root categories: %. Create/rename them in Admin → Categories to match (Menuserie, Electricite, Clefs, Outils, Plomberie, …), then re-run.',",
);
lines.push("      v_missing, coalesce(v_available, '(none)');");
lines.push('  end if;');
lines.push('');
lines.push("  raise notice 'EYO category map: %',");
lines.push(
  "    (select string_agg(excel_key || '→' || matched_name, ', ' order by excel_key) from eyo_cat_map);",
);
lines.push('');

for (const p of products) {
  const excelCatKey = p.category.toLowerCase();
  const prodId = uuidFrom(p.identityKey);
  const entryId = uuidFrom('entry:' + p.identityKey);
  const serialPce = p.serialBase + '-PCE';
  const serialPkg = p.serialBase + '-PKG';
  const serialCtn = p.serialBase + '-CTN';

  lines.push(
    `  -- ${p.itemNo}: ${p.name}${p.sharedItemNo ? ` (row ${p.excelRow}, occurrence ${p.occurrence})` : ''}`,
  );
  lines.push(
    `  -- stock ${p.ctn} CTN x ${p.paquet} paquet x ${p.pcsPerPq} pcs = ${p.stockPieces} pieces`,
  );
  lines.push(`  v_product_id := '${prodId}'::uuid;`);
  lines.push(
    `  select category_id into v_cat_id from eyo_cat_map where excel_key = ${sqlStr(excelCatKey)};`,
  );
  lines.push(`  v_pcs_per_pkg := ${p.pcsPerPq};`);
  lines.push(`  v_pkg_per_ctn := ${p.paquet};`);
  lines.push(`  v_pcs_per_ctn := ${p.piecesPerCarton};`);
  lines.push(`  v_stock := ${p.stockPieces};`);
  lines.push(`  v_entry_id := '${entryId}'::uuid;`);
  lines.push('');
  lines.push('  if v_cat_id is null then');
  lines.push(
    `    raise exception 'EYO seed: category map miss for %', ${sqlStr(excelCatKey)};`,
  );
  lines.push('  end if;');
  lines.push('');
  lines.push('  insert into public.products (');
  lines.push('    id, depot_id, category_id, name, photo_url,');
  lines.push('    current_stock_pieces, is_active');
  lines.push('  ) values (');
  lines.push('    v_product_id, v_depot_id, v_cat_id,');
  lines.push(`    ${sqlStr(p.name)}, ${sqlStr(p.photoUrl)},`);
  lines.push('    v_stock, true');
  lines.push('  )');
  lines.push('  on conflict (id) do update set');
  lines.push('    category_id = excluded.category_id,');
  lines.push('    name = excluded.name,');
  lines.push('    photo_url = excluded.photo_url,');
  lines.push('    current_stock_pieces = excluded.current_stock_pieces,');
  lines.push('    is_active = true,');
  lines.push('    updated_at = now();');
  lines.push('');
  lines.push('  insert into public.product_units (');
  lines.push('    product_id, unit_level, unit_name, serial_number,');
  lines.push('    relative_quantity, conversion_to_base,');
  lines.push('    cost_price_cfa, selling_price_cfa');
  lines.push('  ) values');
  lines.push(
    `    (v_product_id, 0, 'Piece',   ${sqlStr(serialPce)}, null,          1,            0, 1),`,
  );
  lines.push(
    `    (v_product_id, 1, 'Paquet',  ${sqlStr(serialPkg)}, v_pcs_per_pkg, v_pcs_per_pkg, 0, 1),`,
  );
  lines.push(
    `    (v_product_id, 2, 'Carton',  ${sqlStr(serialCtn)}, v_pkg_per_ctn, v_pcs_per_ctn, 0, 1)`,
  );
  lines.push('  on conflict (product_id, unit_level) do update set');
  lines.push('    unit_name = excluded.unit_name,');
  lines.push('    serial_number = excluded.serial_number,');
  lines.push('    relative_quantity = excluded.relative_quantity,');
  lines.push('    conversion_to_base = excluded.conversion_to_base,');
  lines.push('    updated_at = now();');
  lines.push('');
  lines.push('  insert into public.stock_entries (');
  lines.push('    id, product_id, depot_id, unit_level,');
  lines.push('    quantity_in_unit, quantity_pieces, note, entered_by');
  lines.push('  ) values (');
  lines.push('    v_entry_id, v_product_id, v_depot_id, 2,');
  lines.push(`    ${p.ctn}, v_stock, 'EYO dossier 1 opening stock', v_admin_id`);
  lines.push('  )');
  lines.push('  on conflict (id) do nothing;');
  lines.push('');
  lines.push('  if not exists (');
  lines.push('    select 1 from public.inventory_transactions');
  lines.push("    where reference_type = 'stock_entry' and reference_id = v_entry_id");
  lines.push('  ) then');
  lines.push('    insert into public.inventory_transactions (');
  lines.push('      depot_id, product_id, quantity_pieces, transaction_type,');
  lines.push('      reference_type, reference_id, created_by, metadata');
  lines.push('    ) values (');
  lines.push("      v_depot_id, v_product_id, v_stock, 'RESTOCK',");
  lines.push("      'stock_entry', v_entry_id, v_admin_id,");
  lines.push(
    `      jsonb_build_object('note', 'EYO dossier 1 opening stock', 'item_no', ${sqlStr(p.itemNo)}, 'excel_row', ${p.excelRow})`,
  );
  lines.push('    );');
  lines.push('  end if;');
  lines.push('');
}

lines.push(
  `  raise notice 'EYO seed complete: ${products.length} products into depot %', v_depot_id;`,
);
lines.push('end;');
lines.push('$$;');
lines.push('');
lines.push('select');
lines.push("  'EYO SEED OK' as status,");
lines.push('  (select count(*) from public.products) as product_count,');
lines.push('  (select count(*) from public.categories where parent_id is null) as root_categories,');
lines.push('  (select count(*) from public.product_units');
lines.push("    where serial_number like '%-PCE') as piece_serials;");

ensureDir(path.dirname(OUT_SQL));
fs.writeFileSync(OUT_SQL, lines.join('\n'), 'utf8');
if (fs.existsSync(OLD_SQL)) {
  fs.unlinkSync(OLD_SQL);
  console.log('removed outdated migration', path.basename(OLD_SQL));
}
console.log('wrote', OUT_SQL);
console.log('bytes', fs.statSync(OUT_SQL).size);
console.log('images', fs.readdirSync(OUT_IMG).length);
