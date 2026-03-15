"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Database, RefreshCw, LogOut, Edit2, Trash2, Search,
  Plus, Save, X, UploadCloud, LayoutDashboard, LogIn, Eye, EyeOff, AlertTriangle, ShieldCheck, FileText
} from "lucide-react"
import AppToast from "@/app/components/app-toast"
import { getAccessToken, getCurrentUser, loginWithPassword, signOut } from "@/app/lib/chat-memory"
import { validateCsvText } from "@/app/lib/admin-csv"
import { isValidEmail, toThaiAuthError } from "@/app/lib/auth-form"

type DocumentItem = {
  id: number
  question: string
  answer: string
  content?: string
}

type DocumentResponse = {
  items: DocumentItem[]
  total: number
  page: number
  pageSize: number
  error?: string
}

type Metrics = {
  totalDocuments: number
  embeddedDocuments: number
  pendingEmbeddings: number
  latestDocumentId: number | null
}

type ToastState = {
  kind: "success" | "error" | "info"
  text: string
}

export default function AdminPage() {
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [isAuthed, setIsAuthed] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  const [items, setItems] = useState<DocumentItem[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [tableDensity, setTableDensity] = useState<"compact" | "comfortable">("comfortable")
  const [toast, setToast] = useState<ToastState | null>(null)

  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)

  const [csvText, setCsvText] = useState("")
  const [csvFileName, setCsvFileName] = useState("")
  const [csvValidationError, setCsvValidationError] = useState<string | null>(null)
  const [importEmbedNow, setImportEmbedNow] = useState(true)
  const [importDedupeByContent, setImportDedupeByContent] = useState(true)
  const [savingDocument, setSavingDocument] = useState(false)
  const [importingCsv, setImportingCsv] = useState(false)
  const [reembeddingAll, setReembeddingAll] = useState(false)
  const [confirmAction, setConfirmAction] = useState<null | { type: "delete"; id: number } | { type: "reembedAll" }>(null)

  const totalPages = useMemo(() => Math.max(Math.ceil(total / pageSize), 1), [total, pageSize])
  const emailInvalid = email.length > 0 && !isValidEmail(email)

  function showToast(kind: ToastState["kind"], text: string) {
    setToast({ kind, text })
    setTimeout(() => setToast(null), 3000)
  }

  function getHeaders() {
    return {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    }
  }

  async function adminFetch(url: string, init?: RequestInit) {
    const response = await fetch(url, init)
    if (response.status === 401) {
      setIsAuthed(false)
      setAccessToken(null)
      throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่")
    }
    return response
  }

  async function checkAuth() {
    setCheckingAuth(true)
    try {
      const user = await getCurrentUser()
      const token = await getAccessToken()
      if (!user || !token) {
        setIsAuthed(false)
      } else {
        setAccessToken(token)
        setEmail(user.email ?? "")
        setIsAuthed(true)
      }
    } catch {
      setIsAuthed(false)
    } finally {
      setCheckingAuth(false)
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  async function loadMetrics() {
    if (!isAuthed) return

    try {
      const res = await adminFetch("/api/admin/metrics", { headers: getHeaders() })
      const data = (await res.json()) as Metrics & { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "ไม่สามารถโหลดข้อมูลสถิติได้")
      }
      setMetrics(data)
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
      showToast("error", apiMessage)
    }
  }

  async function loadDocuments(nextPage = page, nextQuery = query) {
    if (!isAuthed) return

    setIsLoading(true)
    setToast(null)

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(pageSize),
        search: nextQuery
      })

      const res = await adminFetch(`/api/admin/documents?${params.toString()}`, { headers: getHeaders() })
      const data = (await res.json()) as DocumentResponse

      if (!res.ok) {
        throw new Error(data.error ?? "ไม่สามารถโหลดข้อมูลเอกสารได้")
      }

      setItems(data.items)
      setTotal(data.total)
      setPage(data.page)
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
      showToast("error", apiMessage)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthed || !accessToken) return
    loadDocuments(1, query)
    loadMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, accessToken])

  useEffect(() => {
    if (!isAuthed || !accessToken) return
    void loadDocuments(1, query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize])

  useEffect(() => {
    if (!confirmAction) return

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConfirmAction(null)
      }
    }

    window.addEventListener("keydown", onEsc)
    return () => window.removeEventListener("keydown", onEsc)
  }, [confirmAction])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setToast(null)
    if (!email.trim() || !password || emailInvalid) {
      showToast("error", "กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง")
      return
    }

    try {
      setAuthSubmitting(true)
      const result = await loginWithPassword(email.trim(), password)

      if (result.error) {
        throw new Error(result.error.message)
      }

      const token = await getAccessToken()
      const user = await getCurrentUser()

      if (!token || !user) {
        showToast("error", "ไม่สามารถตรวจสอบสิทธิ์ผู้ดูแลระบบได้")
        return
      }

      setAccessToken(token)
      setIsAuthed(true)
      setEmail(user.email ?? email)
      showToast("success", "เข้าสู่ระบบผู้ดูแลระบบสำเร็จ")
      setPassword("")
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "เข้าสู่ระบบล้มเหลว"
      showToast("error", toThaiAuthError(apiMessage))
    } finally {
      setAuthSubmitting(false)
    }
  }

  function startEdit(item: DocumentItem) {
    setEditingId(item.id)
    setQuestion(item.question)
    setAnswer(item.answer)
  }

  function resetEditor() {
    setEditingId(null)
    setQuestion("")
    setAnswer("")
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!question.trim() || !answer.trim()) return

    setToast(null)

    const method = editingId ? "PATCH" : "POST"
    const url = editingId ? `/api/admin/documents/${editingId}` : "/api/admin/documents"

    try {
      setSavingDocument(true)
      const res = await adminFetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify({ question, answer, embedNow: true })
      })
      const data = (await res.json()) as { error?: string }

      if (!res.ok) {
        throw new Error(data.error ?? "การบันทึกข้อมูลล้มเหลว")
      }

      showToast("success", editingId ? "อัปเดตข้อมูลสำเร็จ" : "เพิ่มข้อมูลใหม่สำเร็จ")
      resetEditor()
      await Promise.all([loadDocuments(), loadMetrics()])
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "เกิดข้อผิดพลาดในการบันทึก"
      showToast("error", apiMessage)
    } finally {
      setSavingDocument(false)
    }
  }

  async function deleteDocument(id: number) {
    try {
      const res = await adminFetch(`/api/admin/documents/${id}`, {
        method: "DELETE",
        headers: getHeaders()
      })

      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "ลบข้อมูลล้มเหลว")
      }

      showToast("success", "ลบเอกสารสำเร็จ")
      if (items.length === 1 && page > 1) {
        await loadDocuments(page - 1)
      } else {
        await loadDocuments()
      }
      await loadMetrics()
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "เกิดข้อผิดพลาดในการลบ"
      showToast("error", apiMessage)
    }
  }

  async function reembedOne(id: number) {
    try {
      const res = await adminFetch(`/api/admin/reembed/${id}`, {
        method: "POST",
        headers: getHeaders()
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "การประมวลผลล้มเหลว")
      }
      showToast("success", `อัปเดตการประมวลผลหมายเลข #${id} สำเร็จ`)
      await loadMetrics()
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "เกิดข้อผิดพลาดในการประมวลผล"
      showToast("error", apiMessage)
    }
  }

  async function reembedAll() {
    try {
      setReembeddingAll(true)
      showToast("info", "กำลังประมวลผลข้อมูลทั้งหมด กรุณารอสักครู่...")
      const res = await adminFetch("/api/admin/reembed-all", {
        method: "POST",
        headers: getHeaders()
      })
      const data = (await res.json()) as { total?: number; success?: number; failed?: Array<{ id: number }>; error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "การประมวลผลทั้งหมดล้มเหลว")
      }
      const failedCount = data.failed?.length ?? 0
      if (failedCount > 0) {
        showToast("info", `ประมวลผลเสร็จสิ้น: สำเร็จ ${data.success}/${data.total} รายการ, ล้มเหลว ${failedCount} รายการ`)
      } else {
        showToast("success", `ประมวลผลเสร็จสิ้น: สำเร็จ ${data.success}/${data.total} รายการ`)
      }
      await loadMetrics()
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "เกิดข้อผิดพลาดในการประมวลผล"
      showToast("error", apiMessage)
    } finally {
      setReembeddingAll(false)
    }
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!csvText.trim()) return

    const check = validateCsvText(csvText)
    if (!check.valid) {
      const message = check.errors.join(" | ")
      setCsvValidationError(message)
      showToast("error", message)
      return
    }

    setToast(null)
    setCsvValidationError(null)
    showToast("info", "กำลังนำเข้าข้อมูล...")

    try {
      setImportingCsv(true)
      const res = await adminFetch("/api/admin/import-csv", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ csvText, embedNow: importEmbedNow, dedupeByContent: importDedupeByContent })
      })

      const data = (await res.json()) as {
        imported?: number
        embedded?: number
        failed?: Array<{ id: number }>
        skippedDuplicates?: number
        error?: string
      }
      if (!res.ok) {
        throw new Error(data.error ?? "นำเข้าข้อมูลล้มเหลว")
      }

      const failedCount = data.failed?.length ?? 0
      const skipped = data.skippedDuplicates ?? 0
      if (failedCount > 0) {
        showToast(
          "info",
          `นำเข้าสำเร็จ ${data.imported} รายการ, ประมวลผล ${data.embedded} รายการ, ข้ามซ้ำ ${skipped} รายการ, ล้มเหลว ${failedCount} รายการ`
        )
      } else {
        showToast("success", `นำเข้าสำเร็จ ${data.imported} รายการ, ประมวลผล ${data.embedded} รายการ, ข้ามซ้ำ ${skipped} รายการ`)
      }
      setCsvText("")
      setCsvFileName("")
      await Promise.all([loadDocuments(1, query), loadMetrics()])
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "เกิดข้อผิดพลาดในการนำเข้าข้อมูล"
      showToast("error", apiMessage)
    } finally {
      setImportingCsv(false)
    }
  }

  async function handleCsvFileSelected(file: File | null) {
    if (!file) return

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith(".csv") && file.type !== "text/csv") {
      setCsvValidationError("รองรับเฉพาะไฟล์ .csv")
      showToast("error", "รองรับเฉพาะไฟล์ .csv")
      return
    }

    const text = await file.text()
    setCsvFileName(file.name)
    setCsvText(text)

    const check = validateCsvText(text)
    if (!check.valid) {
      const message = check.errors.join(" | ")
      setCsvValidationError(message)
      showToast("error", message)
      return
    }

    setCsvValidationError(null)
    showToast("success", `ไฟล์พร้อมนำเข้า: ${check.dataLines} แถวข้อมูล`)
  }

  async function handleLogout() {
    await signOut()
    setIsAuthed(false)
    setAccessToken(null)
    setToast(null)
  }

  // ==========================================
  // RENDER: Loading State
  // ==========================================
  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <RefreshCw className="animate-spin text-[#672c91]" size={32} />
          <span className="font-medium animate-pulse">กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...</span>
        </div>
      </main>
    )
  }

  // ==========================================
  // RENDER: Login State
  // ==========================================
  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <section className="bg-white max-w-md w-full rounded-2xl shadow-xl border border-gray-100 p-8 relative">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="bg-[#672c91]/10 text-[#672c91] px-3 py-1 rounded-full flex items-center gap-2 text-sm font-semibold mb-4">
              <ShieldCheck size={16} /> Admin Access
            </div>
            <Database size={48} className="text-[#672c91] mb-4" />
            <h1 className="text-2xl font-bold text-gray-800">เข้าสู่ระบบผู้ดูแลระบบ</h1>
            <p className="text-sm text-gray-500 mt-2">ใช้บัญชีที่ได้รับสิทธิ์จัดการฐานความรู้เท่านั้น</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@up.ac.th"
                required
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#672c91] focus:border-[#672c91] outline-none transition-all ${emailInvalid ? 'border-red-500' : 'border-gray-300'}`}
              />
              {emailInvalid && <p className="text-red-500 text-xs mt-1">รูปแบบอีเมลไม่ถูกต้อง</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#672c91] focus:border-[#672c91] outline-none transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full bg-[#672c91] hover:bg-[#522374] text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogIn size={18} /> {authSubmitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-gray-500 hover:text-[#672c91] hover:underline transition">
              ← กลับไปหน้าแชท
            </Link>
          </div>

          {/* Toast Notification (Login) */}
          {toast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-full max-w-sm px-4">
              <AppToast kind={toast.kind} text={toast.text} />
            </div>
          )}
        </section>
      </main>
    )
  }

  // ==========================================
  // RENDER: Admin Dashboard State
  // ==========================================
  return (
    <main className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-12">
      {/* Toast Notification (Dashboard) */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 pointer-events-none">
          <div className="pointer-events-auto shadow-lg rounded-lg">
            <AppToast kind={toast.kind} text={toast.text} />
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#672c91] text-white p-2 rounded-lg">
              <LayoutDashboard size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">ระบบจัดการฐานความรู้ (RAG)</h1>
              <p className="text-xs text-gray-500 hidden sm:block">จัดการข้อมูลเอกสารและอัปเดตระบบค้นหาด้วย AI Embeddings</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setConfirmAction({ type: "reembedAll" })}
              disabled={reembeddingAll}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-[#672c91] bg-purple-50 hover:bg-purple-100 rounded-lg transition disabled:opacity-50"
            >
              <RefreshCw size={16} className={reembeddingAll ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{reembeddingAll ? "กำลังประมวลผล..." : "อัปเดตข้อมูลทั้งหมด"}</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <LogOut size={16} /> <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Metrics Cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <article className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm border-l-4 border-blue-500">
            <h3 className="text-sm font-medium text-gray-500">เอกสารทั้งหมด</h3>
            <p className="text-2xl font-bold text-gray-900 mt-1">{metrics?.totalDocuments ?? "-"}</p>
          </article>
          <article className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm border-l-4 border-green-500">
            <h3 className="text-sm font-medium text-gray-500">ประมวลผลแล้ว</h3>
            <p className="text-2xl font-bold text-gray-900 mt-1">{metrics?.embeddedDocuments ?? "-"}</p>
          </article>
          <article className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm border-l-4 border-[#e8b222]">
            <h3 className="text-sm font-medium text-gray-500">รอประมวลผล</h3>
            <p className="text-2xl font-bold text-gray-900 mt-1">{metrics?.pendingEmbeddings ?? "-"}</p>
          </article>
          <article className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm border-l-4 border-[#672c91]">
            <h3 className="text-sm font-medium text-gray-500">รหัสเอกสารล่าสุด</h3>
            <p className="text-2xl font-bold text-gray-900 mt-1">{metrics?.latestDocumentId ?? "-"}</p>
          </article>
        </section>

        {/* Forms Section */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add/Edit Form */}
          <article className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4 text-[#672c91]">
              {editingId ? <><Edit2 size={20} /> แก้ไขเอกสาร #{editingId}</> : <><Plus size={20} /> เพิ่มเอกสารใหม่</>}
            </h2>
            <form onSubmit={submitDocument} className="flex flex-col flex-grow space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">คำถาม / หัวข้อ</label>
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={2}
                  required
                  placeholder="ระบุคำถามหรือหัวข้อที่ผู้ใช้อาจสอบถาม..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#672c91] focus:border-[#672c91] outline-none text-sm transition"
                />
              </div>
              <div className="flex-grow">
                <label className="block text-sm font-medium text-gray-700 mb-1">คำตอบ / ข้อมูล</label>
                <textarea
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  rows={4}
                  required
                  placeholder="ระบุคำตอบหรือข้อมูลที่ถูกต้องและครบถ้วน..."
                  className="w-full h-[120px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#672c91] focus:border-[#672c91] outline-none text-sm transition resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2 mt-auto">
                <button
                  type="submit"
                  disabled={savingDocument}
                  className="flex-1 bg-[#672c91] hover:bg-[#522374] text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save size={16} />
                  {savingDocument ? "กำลังบันทึก..." : editingId ? "อัปเดตและประมวลผล" : "บันทึกและประมวลผล"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetEditor}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition flex items-center gap-2"
                  >
                    <X size={16} /> ยกเลิก
                  </button>
                )}
              </div>
            </form>
          </article>

          {/* Import CSV Form */}
          <article className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-2 text-[#672c91]">
              <UploadCloud size={20} /> นำเข้าไฟล์ CSV
            </h2>
            <p className="text-xs text-gray-500 mb-4">รูปแบบคอลัมน์ที่รองรับ: `question,answer` (มีบรรทัดหัวข้อหรือไม่ก็ได้)</p>
            <form onSubmit={importCsv} className="flex flex-col flex-grow space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:bg-gray-50 transition relative group">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void handleCsvFileSelected(event.target.files?.[0] ?? null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <FileText className="mx-auto text-gray-400 mb-2 group-hover:text-[#672c91] transition-colors" size={24} />
                <span className="text-sm font-medium text-[#672c91]">เลือกไฟล์ CSV</span> หรือลากวางที่นี่
                {csvFileName && <p className="text-xs text-green-600 mt-2 font-medium bg-green-50 inline-block px-2 py-1 rounded">ไฟล์ที่เลือก: {csvFileName}</p>}
              </div>

              <textarea
                value={csvText}
                onChange={(event) => setCsvText(event.target.value)}
                rows={3}
                placeholder={'question,answer\n"คำถามที่ 1","คำตอบที่ 1"'}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#672c91] outline-none text-sm font-mono transition ${csvValidationError ? 'border-red-500' : 'border-gray-300'}`}
              />
              {csvValidationError && <p className="text-red-500 text-xs mt-1">{csvValidationError}</p>}

              <div className="space-y-2 mt-auto pt-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importEmbedNow}
                    onChange={(event) => setImportEmbedNow(event.target.checked)}
                    className="rounded text-[#672c91] focus:ring-[#672c91]"
                  />
                  ประมวลผล AI Embedding ทันทีหลังนำเข้า
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importDedupeByContent}
                    onChange={(event) => setImportDedupeByContent(event.target.checked)}
                    className="rounded text-[#672c91] focus:ring-[#672c91]"
                  />
                  ข้ามรายการซ้ำจากข้อมูลที่มีอยู่แล้ว
                </label>
              </div>

              <button
                type="submit"
                disabled={importingCsv}
                className="w-full bg-[#e8b222] hover:bg-[#d4a01c] text-gray-900 px-4 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 mt-2 shadow-sm"
              >
                <UploadCloud size={16} />
                {importingCsv ? "กำลังนำเข้า..." : "นำเข้าข้อมูล"}
              </button>
            </form>
          </article>
        </section>

        {/* Data Table Section */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Table Toolbar */}
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col lg:flex-row justify-between items-center gap-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-800 whitespace-nowrap">
              <Database size={20} className="text-[#672c91]" /> รายการข้อมูล
            </h2>

            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                แสดง
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  disabled={isLoading}
                  className="border border-gray-300 rounded px-2 py-1 text-sm bg-white outline-none focus:ring-1 focus:ring-[#672c91]"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                รายการ
              </label>

              <div className="relative flex-grow lg:flex-grow-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setQuery(search.trim())
                      loadDocuments(1, search.trim())
                    }
                  }}
                  placeholder="ค้นหาคำถามหรือคำตอบ..."
                  className="w-full lg:w-64 pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#672c91] outline-none transition"
                />
              </div>

              <button
                type="button"
                className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                onClick={() => {
                  setQuery(search.trim())
                  loadDocuments(1, search.trim())
                }}
                disabled={isLoading}
              >
                ค้นหา
              </button>

              <button
                type="button"
                className="p-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                onClick={() => loadDocuments()}
                disabled={isLoading}
                title="รีเฟรชข้อมูล"
              >
                <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
              </button>

              <div className="flex bg-white rounded-lg border border-gray-300 p-0.5 ml-auto lg:ml-0" role="group">
                <button
                  type="button"
                  onClick={() => setTableDensity("comfortable")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition ${tableDensity === "comfortable" ? "bg-[#672c91] text-white shadow" : "text-gray-500 hover:bg-gray-100"}`}
                >
                  สบายตา
                </button>
                <button
                  type="button"
                  onClick={() => setTableDensity("compact")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition ${tableDensity === "compact" ? "bg-[#672c91] text-white shadow" : "text-gray-500 hover:bg-gray-100"}`}
                >
                  กระชับ
                </button>
              </div>
            </div>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-gray-700 text-xs uppercase font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 w-20">รหัส</th>
                  <th className="px-4 py-3 w-1/3">คำถาม / หัวข้อ</th>
                  <th className="px-4 py-3">คำตอบ / ข้อมูล</th>
                  <th className="px-4 py-3 w-32 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  // Skeleton Loading (Tailwind)
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-8"></div></td>
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-3/4"></div></td>
                      <td className="px-4 py-4">
                        <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                        <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                      </td>
                      <td className="px-4 py-4 text-right"><div className="h-6 bg-gray-200 rounded w-16 ml-auto"></div></td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  // Empty State
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <Database size={48} className="mb-3 opacity-50" />
                        <p className="text-base text-gray-600 font-medium">
                          {query ? `ไม่พบข้อมูลที่ตรงกับคำค้นหา "${query}"` : "ไม่พบรายการข้อมูลในระบบ"}
                        </p>
                        {query && (
                          <button
                            type="button"
                            className="mt-3 px-4 py-2 bg-purple-50 text-[#672c91] rounded-lg text-sm font-medium hover:bg-purple-100 transition"
                            onClick={() => {
                              setSearch("")
                              setQuery("")
                              void loadDocuments(1, "")
                            }}
                          >
                            ล้างคำค้นหา
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  // Data Rows
                  items.map((item) => (
                    <tr key={item.id} className="hover:bg-purple-50/30 transition-colors group">
                      <td className={`px-4 ${tableDensity === "compact" ? "py-2.5" : "py-4"} font-medium text-gray-900`}>#{item.id}</td>
                      <td className={`px-4 ${tableDensity === "compact" ? "py-2.5" : "py-4"} text-gray-800`}>{item.question}</td>
                      <td className={`px-4 ${tableDensity === "compact" ? "py-2.5" : "py-4"} ${tableDensity === "compact" ? "line-clamp-2" : "whitespace-pre-wrap"}`}>
                        {item.answer}
                      </td>
                      <td className={`px-4 ${tableDensity === "compact" ? "py-2.5" : "py-4"} text-right align-top`}>
                        <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={() => startEdit(item)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition" title="แก้ไข">
                            <Edit2 size={16} />
                          </button>
                          <button type="button" onClick={() => reembedOne(item.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded transition" title="ประมวลผลใหม่">
                            <RefreshCw size={16} />
                          </button>
                          <button type="button" onClick={() => setConfirmAction({ type: "delete", id: item.id })} className="p-1.5 text-red-600 hover:bg-red-50 rounded transition" title="ลบ">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination */}
          <div className="p-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between text-sm gap-4">
            <span className="text-gray-500 font-medium">
              หน้า <span className="text-gray-900">{page}</span> จาก {totalPages} <span className="text-gray-400">|</span> รวมทั้งหมด {total} รายการ
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || isLoading}
                onClick={() => loadDocuments(page - 1, query)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                หน้าก่อนหน้า
              </button>
              <button
                type="button"
                disabled={page >= totalPages || isLoading}
                onClick={() => loadDocuments(page + 1, query)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                หน้าถัดไป
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* ==========================================
          MODAL: Confirmation Dialog
      ========================================== */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 transition-opacity"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmAction(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5 flex items-start gap-4">
              <div className="bg-red-100 text-red-600 p-2.5 rounded-full flex-shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">ยืนยันการดำเนินการ</h3>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                  {confirmAction.type === "delete"
                    ? `คุณแน่ใจหรือไม่ที่จะทำการลบเอกสารหมายเลข #${confirmAction.id}? ข้อมูลนี้จะถูกลบออกจากระบบค้นหาอย่างถาวร`
                    : "คุณต้องการอัปเดตประมวลผลข้อมูล (AI Embeddings) ทั้งหมดใช่หรือไม่? การดำเนินการนี้อาจใช้เวลาสักครู่"}
                </p>
              </div>
            </div>
            <div className="bg-gray-50 px-5 py-4 flex justify-end gap-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = confirmAction
                  setConfirmAction(null)
                  if (action.type === "delete") {
                    void deleteDocument(action.id)
                  } else {
                    void reembedAll()
                  }
                }}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition shadow-sm ${
                  confirmAction.type === "delete"
                    ? "bg-red-600 hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    : "bg-[#672c91] hover:bg-[#522374] focus:ring-2 focus:ring-[#672c91] focus:ring-offset-2"
                }`}
              >
                {confirmAction.type === "delete" ? "ยืนยันการลบ" : "ยืนยันการอัปเดต"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
