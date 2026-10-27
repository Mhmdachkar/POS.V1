import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ALLOW = new Set([
  "Administration",
  "Admin",
  "Audit",
  "Email",
  "OK",
  "PDF",
  "Stock",
  "Total",
  "Excel (XLSX)",
  "Action",
  "Actions",
  "Code",
  "Transactions",
  "Date",
  "CSV",
  "Excel",
  "Notes",
  "Type",
  "Description",
  "Contact",
  "TOTAL",
  "Note",
  "Carton",
  "carton",
  "cartons",
  "N/A",
  "Exact",
  "0–100",
  "Net",
  "Original",
  "Source",
  "Destination",
  "Z 80 mm",
  "Z 58 mm",
  "Z A4",
])

function pairs(source: string): Array<{ fr: string; en: string }> {
  const found: Array<{ fr: string; en: string }> = []
  const pattern = /bi\(\s*(?:'([^'\\]*)'|"([^"\\]*)")\s*,\s*(?:'([^'\\]*)'|"([^"\\]*)")/g
  for (const match of source.matchAll(pattern)) {
    found.push({ fr: match[1] ?? match[2] ?? "", en: match[3] ?? match[4] ?? "" })
  }
  return found
}

describe("French locale pairs", () => {
  it("has a French string that is not an empty copy of English", () => {
    const dir = join(process.cwd(), "src/lib/bilingual")
    const failures: string[] = []
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts") || file === "types.ts") continue
      const source = readFileSync(join(dir, file), "utf8")
      pairs(source).forEach((pair, index) => {
        if (!pair.fr.trim()) failures.push(`${file}#${index} missing French`)
        if (pair.fr === pair.en && !ALLOW.has(pair.fr)) failures.push(`${file} identical: ${pair.fr}`)
      })
    }
    expect(failures).toEqual([])
  })
})
