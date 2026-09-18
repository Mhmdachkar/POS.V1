import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const execFileAsync = promisify(execFile)

/**
 * Submit plain text to the Windows print spooler (honest spooler accept).
 */
export async function printTextToWindowsPrinter(text, printerName) {
  if (process.platform !== 'win32') {
    throw new Error('Windows printer path requires win32')
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vhm-print-'))
  const filePath = path.join(dir, 'ticket.txt')
  await fs.writeFile(filePath, text, 'utf8')

  const ps = [
    '$ErrorActionPreference = "Stop"',
    `$p = ${JSON.stringify(printerName)}`,
    `$f = ${JSON.stringify(filePath)}`,
    'Get-Content -LiteralPath $f -Raw -Encoding UTF8 | Out-Printer -Name $p',
  ].join('; ')

  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { windowsHide: true },
    )
  } finally {
    await fs.unlink(filePath).catch(() => {})
    await fs.rmdir(dir).catch(() => {})
  }
}
