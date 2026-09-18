/**
 * DEV ONLY — expand the Dakar POS demo catalog for visual QA.
 *
 * Uses existing admin RPCs (create_category / create_product / restock_product
 * / deactivate_product). Does not change schema, RPCs, or existing seed SKUs.
 *
 * Do NOT run against a live production inventory.
 * Idempotent: skips products that already exist in the depot by name.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.env')
const envText = readFileSync(envPath, 'utf8')
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1)]
    }),
)

const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY
if (!url || !anon) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}
if (!url.includes('127.0.0.1') && !url.includes('localhost') && process.env.PHASE15A_ALLOW_REMOTE !== '1') {
  console.error('Refusing to write catalog to a remote project.')
  console.error('Re-run with PHASE15A_ALLOW_REMOTE=1 only for the hosted DEV database this POS uses.')
  process.exit(1)
}

const DEPOT_A = '00000000-0000-0000-0001-000000000001'
/** fit=max — full subject in frame; POS renders with object-contain (no crop). */
const PHOTO = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=max&w=900&h=900&q=80`
const unit = (unit_level, unit_name, conversion_to_base, cost_price_cfa, selling_price_cfa) => ({
  unit_level,
  unit_name,
  conversion_to_base,
  cost_price_cfa,
  selling_price_cfa,
})

const CATALOG = [
  { name: 'Orange Juice 1L', category: 'Beverages', stock: 180, photo: PHOTO('1600271886742-f049cd451bba'), units: [unit(0, 'Bottle', 1, 450, 650), unit(1, 'Pack', 6, 2500, 3600)] },
  { name: 'UHT Milk 1L', category: 'Beverages', stock: 90, photo: PHOTO('1550583724-b2692b85b150'), units: [unit(0, 'Carton', 1, 500, 700), unit(1, 'Pack', 6, 2800, 3900)] },
  { name: 'Natural Yogurt 125g', category: 'Beverages', stock: 36, photo: PHOTO('1488477181946-6428a0291777'), units: [unit(0, 'Cup', 1, 150, 250)] },
  { name: 'Black Tea 50 bags', category: 'Beverages', stock: 4, photo: PHOTO('1564890369478-c89ca6d9cde9'), units: [unit(0, 'Box', 1, 600, 900)] },
  { name: 'Sliced Bread 500g', category: 'Food', stock: 24, photo: PHOTO('1509440159596-0249088772ff'), units: [unit(0, 'Loaf', 1, 400, 600)] },
  { name: 'Spaghetti 500g', category: 'Food', stock: 150, photo: PHOTO('1621996346565-e3dbc646d9a9'), units: [unit(0, 'Pack', 1, 350, 500)] },
  { name: 'White Sugar 1kg', category: 'Food', stock: 60, photo: PHOTO('1587049352846-4a222e784d38'), units: [unit(0, 'Bag', 1, 550, 750)] },
  { name: 'Cooking Oil 1L', category: 'Food', stock: 40, photo: PHOTO('1474979266404-7eaacbcd87c5'), units: [unit(0, 'Bottle', 1, 900, 1250)] },
  { name: 'Tomato Sauce 400g', category: 'Food', stock: 70, photo: PHOTO('1472476443507-c7a9ba33acc0'), units: [unit(0, 'Tin', 1, 300, 450)] },
  { name: 'Canned White Beans', category: 'Food', stock: 55, photo: PHOTO('1584269600464-37b1b58a9fe7'), units: [unit(0, 'Tin', 1, 280, 400)] },
  { name: 'Canned Tuna 160g', category: 'Food', stock: 80, photo: PHOTO('1599084993091-1cb5c0721eb6'), units: [unit(0, 'Tin', 1, 450, 650)] },
  { name: 'Eggs (tray of 12)', category: 'Food', stock: 48, photo: PHOTO('1582722872445-44dc5f7e3c8f'), units: [unit(0, 'Tray', 1, 1400, 1800)] },
  { name: 'Wheat Flour 1kg', category: 'Food', stock: 35, photo: PHOTO('1574323347407-f5e1ad6d020b'), units: [unit(0, 'Bag', 1, 500, 700)] },
  { name: 'Ground Coffee 250g', category: 'Food', stock: 20, photo: PHOTO('1559056199-641a0ac8b55e'), units: [unit(0, 'Pack', 1, 1500, 2200)] },
  { name: 'Premium Extra-Virgin Olive Oil Cold Pressed 750ml', category: 'Food', stock: 12, photo: PHOTO('1474979266404-7eaacbcd87c5'), units: [unit(0, 'Bottle', 1, 2800, 3900)] },
  { name: 'Tea Biscuits 200g', category: 'Snacks', stock: 100, photo: PHOTO('1558961363-fa8fdf82db35'), units: [unit(0, 'Pack', 1, 250, 400)] },
  { name: 'Potato Chips 150g', category: 'Snacks', stock: 75, photo: PHOTO('1566478989037-eec17017d0b4'), units: [unit(0, 'Bag', 1, 300, 500)] },
  { name: 'Milk Chocolate 100g', category: 'Snacks', stock: 45, photo: PHOTO('1606312619070-d48b4d9382c7'), units: [unit(0, 'Bar', 1, 200, 350)] },
  { name: 'Laundry Detergent 2kg', category: 'Household', stock: 30, photo: PHOTO('1610557892470-55d9e80c0bce'), units: [unit(0, 'Bag', 1, 1800, 2500)] },
  { name: 'Household Bleach 1L', category: 'Household', stock: 22, photo: PHOTO('1583947215259-38e31be8751f'), units: [unit(0, 'Bottle', 1, 400, 600)] },
  { name: 'Toilet Tissue 4-pack', category: 'Household', stock: 40, photo: PHOTO('1584556812952-905ffd0c611a'), units: [unit(0, 'Pack', 1, 700, 1000)] },
  { name: 'Safety Matches', category: 'Household', stock: 0, photo: PHOTO('1603006905003-be475563bc59'), units: [unit(0, 'Box', 1, 50, 100)] },
  { name: 'Bar Soap 125g', category: 'Personal Care', stock: 120, photo: PHOTO('1584305574647-0cc949a2d9ff'), units: [unit(0, 'Bar', 1, 150, 250)] },
  { name: 'Toothpaste 75ml', category: 'Personal Care', stock: 64, photo: PHOTO('1629198688000-71f23e745b6e'), units: [unit(0, 'Tube', 1, 400, 650)] },
  { name: 'Shampoo 400ml', category: 'Personal Care', stock: 28, photo: PHOTO('1535585209827-a15fcdbc4c2d'), units: [unit(0, 'Bottle', 1, 800, 1200)] },
]

const TEST_NAME = /^(B8 Lock|B7 |PHASE\d+_TEST_)/i

const supabase = createClient(url, anon, { auth: { persistSession: false } })

function rpcError(label, error) {
  const extra = error?.details || error?.hint || error?.message || error
  throw new Error(`${label}: ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`)
}

async function main() {
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@vhm-pos.internal',
    password: process.env.PHASE15A_ADMIN_PASSWORD || 'Admin2026!',
  })
  if (authError) rpcError('login', authError)

  const { data: categories, error: catErr } = await supabase
    .from('categories')
    .select('id, name, parent_id, is_active')
  if (catErr) rpcError('categories', catErr)

  const catByName = new Map((categories ?? []).map((c) => [c.name, c]))
  for (const name of ['Personal Care', 'Snacks']) {
    if (catByName.get(name)?.is_active) continue
    const { data, error } = await supabase.rpc('create_category', { p_name: name, p_parent_id: null })
    if (error) rpcError(`create_category ${name}`, error)
    catByName.set(name, data)
    console.log('category', name)
  }

  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, name, depot_id, is_active, current_stock_pieces')
    .eq('depot_id', DEPOT_A)
  if (prodErr) rpcError('products', prodErr)

  for (const row of products ?? []) {
    if (TEST_NAME.test(row.name) && row.is_active) {
      const { error } = await supabase.rpc('deactivate_product', { p_product_id: row.id })
      if (error) rpcError(`deactivate ${row.name}`, error)
      console.log('deactivated leftover test SKU', row.name)
    }
  }

  const existing = new Set((products ?? []).map((p) => p.name))
  let created = 0
  for (const item of CATALOG) {
    if (existing.has(item.name)) {
      console.log('skip existing', item.name)
      continue
    }
    const category = catByName.get(item.category)
    if (!category?.id) throw new Error(`Missing category ${item.category}`)
    const { data, error } = await supabase.rpc('create_product', {
      p_depot_id: DEPOT_A,
      p_category_id: category.id,
      p_name: item.name,
      p_photo_url: item.photo,
      p_units: item.units,
    })
    if (error) rpcError(`create_product ${item.name}`, error)
    const productId = data.id ?? data.product_id
    if (item.stock > 0) {
      const { error: restockErr } = await supabase.rpc('restock_product', {
        p_product_id: productId,
        p_unit_level: 0,
        p_quantity_in_unit: item.stock,
        p_note: 'Phase 15A demo catalog',
      })
      if (restockErr) rpcError(`restock ${item.name}`, restockErr)
    }
    created += 1
    console.log('created', item.name, 'stock', item.stock)
  }

  const { count, error: countErr } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('depot_id', DEPOT_A)
    .eq('is_active', true)
  if (countErr) rpcError('count', countErr)
  console.log(`done. created=${created} active_dakar=${count}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
