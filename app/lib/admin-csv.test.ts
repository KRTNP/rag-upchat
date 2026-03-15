import { describe, expect, test } from "vitest"
import { parseCsvRows, validateCsvText } from "@/app/lib/admin-csv"

describe("parseCsvRows", () => {
  test("parses rows with header", () => {
    const rows = parseCsvRows('question,answer\n"Q1","A1"\n"Q2","A2"')
    expect(rows).toEqual([
      { question: "Q1", answer: "A1" },
      { question: "Q2", answer: "A2" }
    ])
  })

  test("ignores invalid rows", () => {
    const rows = parseCsvRows("question,answer\nonlyonecol\n,")
    expect(rows).toEqual([])
  })
})

describe("validateCsvText", () => {
  test("accepts csv with question,answer header", () => {
    const result = validateCsvText('question,answer\n"Q1","A1"')
    expect(result.valid).toBe(true)
    expect(result.hasHeader).toBe(true)
    expect(result.dataLines).toBe(1)
  })

  test("rejects header missing required columns", () => {
    const result = validateCsvText("question,body\nA,B")
    expect(result.valid).toBe(false)
    expect(result.errors.join(" ")).toContain("question")
  })
})
