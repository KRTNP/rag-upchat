export type CsvRow = {
  question: string
  answer: string
}

export type CsvValidation = {
  valid: boolean
  hasHeader: boolean
  totalLines: number
  dataLines: number
  errors: string[]
}

function cleanCell(cell: string) {
  return cell.replace(/^\"|\"$/g, "").trim()
}

export function validateCsvText(csvText: string): CsvValidation {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return {
      valid: false,
      hasHeader: false,
      totalLines: 0,
      dataLines: 0,
      errors: ["ไฟล์ CSV ว่างเปล่า"]
    }
  }

  const first = lines[0].toLowerCase()
  const hasHeader = first.includes("question") || first.includes("answer")
  const headerOk = !hasHeader || (first.includes("question") && first.includes("answer"))
  const rows = parseCsvRows(csvText)
  const errors: string[] = []

  if (!headerOk) {
    errors.push("บรรทัดหัวตารางต้องมีคอลัมน์ question และ answer")
  }

  if (rows.length === 0) {
    errors.push("ไม่พบข้อมูลแถวที่มี question และ answer ครบ")
  }

  return {
    valid: errors.length === 0,
    hasHeader,
    totalLines: lines.length,
    dataLines: rows.length,
    errors
  }
}

export function parseCsvRows(csvText: string): CsvRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return []
  }

  const startIndex = lines[0].toLowerCase().includes("question") && lines[0].toLowerCase().includes("answer") ? 1 : 0

  const rows: CsvRow[] = []

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index]
    const comma = line.indexOf(",")

    if (comma < 0) {
      continue
    }

    const question = cleanCell(line.slice(0, comma))
    const answer = cleanCell(line.slice(comma + 1))

    if (!question || !answer) {
      continue
    }

    rows.push({ question, answer })
  }

  return rows
}
