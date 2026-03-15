export type CsvRow = {
  question: string
  answer: string
}

function cleanCell(cell: string) {
  return cell.replace(/^\"|\"$/g, "").trim()
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
