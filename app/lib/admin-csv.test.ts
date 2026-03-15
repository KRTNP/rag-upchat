import { describe, expect, test } from "vitest"
import { parseCsvRows } from "@/app/lib/admin-csv"

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
