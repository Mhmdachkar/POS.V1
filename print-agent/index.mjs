import 'dotenv/config'
import http from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { renderJobText } from './render.mjs'
import { printTextToWindowsPrinter } from './winPrint.mjs'

const cfg = {
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  email: process.env.SUPABASE_EMAIL,
  password: process.env.SUPABASE_PASSWORD,
  role: process.env.ROLE ?? 'cashier',
  depotId: process.env.DEPOT_ID,
  printerName: process.env.PRINTER_NAME,
  agentId: process.env.AGENT_ID ?? 'agent-1',
  pollMs: Number(process.env.POLL_MS ?? 2500),
  port: Number(process.env.PORT ?? 9277),
}

function requireConfig() {
  for (const [k, v] of Object.entries({
    SUPABASE_URL: cfg.url,
    SUPABASE_ANON_KEY: cfg.anonKey,
    SUPABASE_EMAIL: cfg.email,
    SUPABASE_PASSWORD: cfg.password,
    DEPOT_ID: cfg.depotId,
    PRINTER_NAME: cfg.printerName,
  })) {
    if (!v) throw new Error(`Missing env: ${k}`)
  }
  if (cfg.role !== 'cashier' && cfg.role !== 'depot') {
    throw new Error('ROLE must be cashier or depot')
  }
}

const destination = cfg.role === 'depot' ? 'depot' : 'cashier'

let supabase
let polling = false
let wakePending = false

async function ensureSession() {
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session) return
  const { error } = await supabase.auth.signInWithPassword({
    email: cfg.email,
    password: cfg.password,
  })
  if (error) throw error
}

async function processJobs() {
  if (polling) return
  polling = true
  try {
    await ensureSession()
    const { data: jobs, error } = await supabase.rpc('claim_print_jobs', {
      p_destination: destination,
      p_depot_id: cfg.depotId,
      p_agent_id: cfg.agentId,
      p_limit: 3,
    })
    if (error) {
      console.error('[claim]', error.message)
      return
    }
    for (const job of jobs ?? []) {
      try {
        const text = renderJobText(job)
        await printTextToWindowsPrinter(text, cfg.printerName)
        const { error: ackErr } = await supabase.rpc('ack_print_job', {
          p_job_id: job.id,
          p_ok: true,
          p_error: null,
        })
        if (ackErr) console.error('[ack ok]', ackErr.message)
        else console.log('[printed]', job.payload?.receipt_number ?? job.id, job.document_type)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[print failed]', job.id, msg)
        await supabase.rpc('ack_print_job', {
          p_job_id: job.id,
          p_ok: false,
          p_error: msg,
        })
      }
    }
  } finally {
    polling = false
    if (wakePending) {
      wakePending = false
      void processJobs()
    }
  }
}

function startHttp() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, role: cfg.role, destination }))
      return
    }
    if (req.url === '/wake' && req.method === 'POST') {
      wakePending = true
      void processJobs()
      res.writeHead(204)
      res.end()
      return
    }
    res.writeHead(404)
    res.end()
  })
  server.listen(cfg.port, '127.0.0.1', () => {
    console.log(`Print agent listening http://127.0.0.1:${cfg.port} (${destination})`)
  })
}

async function main() {
  requireConfig()
  supabase = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: true },
  })
  startHttp()
  void processJobs()
  setInterval(() => void processJobs(), cfg.pollMs)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
