import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import Page from "@/app/page"

function mockFetchResponse(payload: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: async () => payload
  })

  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("Chat page", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  test("renders university brand heading and service subtitle", async () => {
    mockFetchResponse({ answer: "พร้อมช่วย" })

    render(<Page />)

    expect(await screen.findByText("มหาวิทยาลัยพะเยา")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "ผู้ช่วย AI มหาวิทยาลัยพะเยา" })).toBeInTheDocument()
    expect(
      screen.getByText("ตอบคำถามด้านการศึกษา กฎระเบียบ และข้อมูลภายในมหาวิทยาลัยจากแหล่งข้อมูลที่กำหนด")
    ).toBeInTheDocument()
  })

  test("submits with Enter and appends user + bot messages", async () => {
    const fetchMock = mockFetchResponse({ answer: "ตอบแล้ว" })

    render(<Page />)

    const input = await screen.findByTestId("chat-input")
    fireEvent.change(input, { target: { value: "สวัสดี" } })
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText("สวัสดี")).toBeInTheDocument()
    expect(screen.getByText("ตอบแล้ว")).toBeInTheDocument()
  })

  test("shows loading state and disables send while awaiting response", async () => {
    let resolveFetch: ((value: unknown) => void) | null = null
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
    )

    vi.stubGlobal("fetch", fetchMock)

    render(<Page />)

    const input = await screen.findByTestId("chat-input")
    const sendButton = screen.getByTestId("send-button")

    await userEvent.type(input, "ทดสอบ")
    await userEvent.click(sendButton)

    expect(sendButton).toBeDisabled()
    expect(screen.getByTestId("chat-status")).toHaveTextContent("ระบบกำลังประมวลผล")

    resolveFetch?.({
      ok: true,
      json: async () => ({ answer: "เสร็จแล้ว" })
    })

    await waitFor(() => {
      expect(sendButton).not.toBeDisabled()
    })
  })

  test("renders error and allows retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ answer: "สำเร็จหลัง retry" })
      })

    vi.stubGlobal("fetch", fetchMock)

    render(<Page />)

    const input = await screen.findByTestId("chat-input")
    const sendButton = screen.getByTestId("send-button")

    await userEvent.type(input, "มีใครอยู่ไหม")
    await userEvent.click(sendButton)

    expect(await screen.findByText("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง")).toBeInTheDocument()

    const retryButton = screen.getByTestId("retry-button")
    await userEvent.click(retryButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    expect(await screen.findByText("สำเร็จหลัง retry")).toBeInTheDocument()
  })

  test("clears all chat messages", async () => {
    mockFetchResponse({ answer: "รับทราบ" })

    render(<Page />)

    const input = await screen.findByTestId("chat-input")
    const sendButton = screen.getByTestId("send-button")

    await userEvent.type(input, "ข้อความแรก")
    await userEvent.click(sendButton)

    expect(await screen.findByText("รับทราบ")).toBeInTheDocument()

    const clearButton = screen.getByTestId("clear-chat-button")
    await userEvent.click(clearButton)

    expect(screen.queryByText("ข้อความแรก")).not.toBeInTheDocument()
    expect(screen.queryByText("รับทราบ")).not.toBeInTheDocument()
  })

  test("persists messages to localStorage and restores on next mount", async () => {
    mockFetchResponse({ answer: "ประวัติถูกบันทึก" })

    const { unmount } = render(<Page />)
    const input = await screen.findByTestId("chat-input")
    const sendButton = screen.getByTestId("send-button")

    await userEvent.type(input, "บันทึกหน่อย")
    await userEvent.click(sendButton)
    await screen.findByText("ประวัติถูกบันทึก")

    const raw = window.localStorage.getItem("rag-upchat:messages")
    expect(raw).toBeTruthy()
    expect(raw).toContain("บันทึกหน่อย")
    expect(raw).toContain("ประวัติถูกบันทึก")

    unmount()

    render(<Page />)
    expect(await screen.findByText("บันทึกหน่อย")).toBeInTheDocument()
    expect(await screen.findByText("ประวัติถูกบันทึก")).toBeInTheDocument()
  })

  test("renders markdown formatting for bot replies", async () => {
    mockFetchResponse({ answer: "**ตัวหนา** และ [ลิงก์](https://example.com)" })

    render(<Page />)
    const input = await screen.findByTestId("chat-input")
    const sendButton = screen.getByTestId("send-button")

    await userEvent.type(input, "แสดง markdown")
    await userEvent.click(sendButton)

    const strong = await screen.findByText("ตัวหนา")
    expect(strong.tagName.toLowerCase()).toBe("strong")

    const link = await screen.findByRole("link", { name: "ลิงก์" })
    expect(link).toHaveAttribute("href", "https://example.com")
  })

  test("shows timestamp metadata for messages", async () => {
    mockFetchResponse({ answer: "มีเวลาแนบ" })

    render(<Page />)
    const input = await screen.findByTestId("chat-input")
    const sendButton = screen.getByTestId("send-button")

    await userEvent.type(input, "ขอเวลา")
    await userEvent.click(sendButton)
    await screen.findByText("มีเวลาแนบ")

    const timestamps = screen.getAllByTestId("message-time")
    expect(timestamps.length).toBeGreaterThanOrEqual(2)
  })

  test("copies bot message text to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", {
      clipboard: { writeText }
    })
    mockFetchResponse({ answer: "ข้อความสำหรับคัดลอก" })

    render(<Page />)
    const input = await screen.findByTestId("chat-input")
    const sendButton = screen.getByTestId("send-button")

    await userEvent.type(input, "ขอคัดลอก")
    await userEvent.click(sendButton)
    await screen.findByText("ข้อความสำหรับคัดลอก")

    const copyButton = screen.getByRole("button", { name: "คัดลอกข้อความ" })
    await userEvent.click(copyButton)

    expect(writeText).toHaveBeenCalledWith("ข้อความสำหรับคัดลอก")
  })

  test("shows animated typing dots while waiting for response", async () => {
    let resolveFetch: ((value: unknown) => void) | null = null
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          })
      )
    )

    render(<Page />)
    const input = await screen.findByTestId("chat-input")
    const sendButton = screen.getByTestId("send-button")

    await userEvent.type(input, "รอหน่อย")
    await userEvent.click(sendButton)

    expect(screen.getByTestId("typing-dots")).toBeInTheDocument()

    resolveFetch?.({
      ok: true,
      json: async () => ({ answer: "มาแล้ว" })
    })
    await screen.findByText("มาแล้ว")
  })
})
