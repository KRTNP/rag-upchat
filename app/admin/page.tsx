"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Database, RefreshCw, LogOut, Edit2, Trash2, Search,
  Plus, Save, X, UploadCloud, LayoutDashboard, LogIn, Eye, EyeOff, AlertTriangle, ShieldCheck
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

  if (checkingAuth) {
    return (
      <main className="admin-page">
        <section className="admin-card admin-auth-loading">
          <p className="status-loading">
            <RefreshCw className="animate-spin" size={20} />
            <span>กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...</span>
          </p>
        </section>
      </main>
    )
  }

  if (!isAuthed) {
    return (
      <main className="admin-page">
        <section className="admin-card admin-auth-card">
          <div className="admin-auth-head">
            <div className="admin-auth-badge">
              <ShieldCheck size={16} />
              Admin Access
            </div>
            <Database size={40} color="var(--accent)" className="admin-auth-icon" />
            <h1 className="admin-auth-title">เข้าสู่ระบบผู้ดูแลระบบ</h1>
            <p className="muted admin-auth-subtitle">ใช้บัญชีที่ได้รับสิทธิ์จัดการฐานความรู้เท่านั้น</p>
          </div>
          <form onSubmit={handleLogin} className="admin-form">
            <label>
              อีเมล
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@up.ac.th" required />
            </label>
            {emailInvalid ? <p className="auth-field-error">รูปแบบอีเมลไม่ถูกต้อง</p> : null}
            <label>
              รหัสผ่าน
              <div className="auth-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <div className="row-actions admin-auth-actions">
              <button type="submit" disabled={authSubmitting} className="admin-auth-submit">
                <LogIn size={16} />
                {authSubmitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
              </button>
            </div>
          </form>
          <p className="auth-footer auth-back-link admin-auth-backlink">
            <Link href="/">กลับไปหน้าแชท</Link>
          </p>
          {toast ? <div className="admin-auth-toast"><AppToast kind={toast.kind} text={toast.text} /></div> : null}
        </section>
      </main>
    )
  }

  return (
    <main className="admin-page">
      <section className="admin-layout">
        <header className="admin-header">
          <div className="admin-header-copy">
            <p className="chat-kicker">ส่วนผู้ดูแลระบบ</p>
            <h1 className="admin-title">
              <LayoutDashboard size={24} />
              ระบบจัดการฐานความรู้ (RAG)
            </h1>
            <p>จัดการข้อมูลเอกสารและอัปเดตระบบค้นหาด้วย AI Embeddings</p>
          </div>
          <div className="admin-header-actions">
            <button
              type="button"
              className="ghost-button admin-action-primary"
              onClick={() => setConfirmAction({ type: "reembedAll" })}
              disabled={reembeddingAll}
            >
              <RefreshCw size={16} />
              {reembeddingAll ? "กำลังประมวลผล..." : "อัปเดตข้อมูลทั้งหมด"}
            </button>
            <button type="button" className="ghost-button admin-action-secondary" onClick={handleLogout}>
              <LogOut size={16} />
              ออกจากระบบ
            </button>
          </div>
        </header>

        <section className="admin-metrics" data-testid="admin-metrics">
          <article className="metric-card tone-primary">
            <h3>เอกสารทั้งหมด</h3>
            <p>{metrics?.totalDocuments ?? "-"}</p>
          </article>
          <article className="metric-card tone-success">
            <h3>ประมวลผลแล้ว</h3>
            <p>{metrics?.embeddedDocuments ?? "-"}</p>
          </article>
          <article className="metric-card tone-warning">
            <h3>รอประมวลผล</h3>
            <p>{metrics?.pendingEmbeddings ?? "-"}</p>
          </article>
          <article className="metric-card tone-accent">
            <h3>รหัสเอกสารล่าสุด</h3>
            <p>{metrics?.latestDocumentId ?? "-"}</p>
          </article>
        </section>

        <section className="admin-grid">
          <article className="admin-block">
            <h2 className="admin-block-title">
              {editingId ? <><Edit2 size={18} /> แก้ไขเอกสาร #{editingId}</> : <><Plus size={18} /> เพิ่มเอกสารใหม่</>}
            </h2>
            <form onSubmit={submitDocument} className="admin-form">
              <label>
                คำถาม / หัวข้อ
                <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} required placeholder="ระบุคำถามหรือหัวข้อที่ผู้ใช้อาจสอบถาม..." />
              </label>
              <label>
                คำตอบ / ข้อมูล
                <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={4} required placeholder="ระบุคำตอบหรือข้อมูลที่ถูกต้องและครบถ้วน..." />
              </label>
              <div className="row-actions">
                <button type="submit" disabled={savingDocument} className="admin-primary-button">
                  <Save size={16} />
                  {savingDocument ? "กำลังบันทึก..." : editingId ? "อัปเดตและประมวลผล" : "บันทึกและประมวลผล"}
                </button>
                {editingId ? (
                  <button type="button" className="ghost-button" onClick={resetEditor}>
                    <X size={16} />
                    ยกเลิกการแก้ไข
                  </button>
                ) : null}
              </div>
            </form>
          </article>

          <article className="admin-block">
            <h2 className="admin-block-title">
              <UploadCloud size={18} /> นำเข้าไฟล์ CSV
            </h2>
            <p className="muted admin-helper-text">รูปแบบคอลัมน์ที่รองรับ: `question,answer` (มีบรรทัดหัวข้อหรือไม่ก็ได้)</p>
            <form onSubmit={importCsv} className="admin-form">
              <label>
                อัปโหลดไฟล์ CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void handleCsvFileSelected(event.target.files?.[0] ?? null)}
                />
              </label>
              {csvFileName ? <p className="muted admin-helper-text">ไฟล์ที่เลือก: {csvFileName}</p> : null}
              <textarea
                value={csvText}
                onChange={(event) => setCsvText(event.target.value)}
                rows={6}
                placeholder={'question,answer\n"คำถามที่ 1","คำตอบที่ 1"\n"คำถามที่ 2","คำตอบที่ 2"'}
              />
              {csvValidationError ? <p className="auth-field-error">{csvValidationError}</p> : null}
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={importEmbedNow}
                  onChange={(event) => setImportEmbedNow(event.target.checked)}
                />
                ประมวลผล AI Embedding ทันทีหลังนำเข้า
              </label>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={importDedupeByContent}
                  onChange={(event) => setImportDedupeByContent(event.target.checked)}
                />
                ข้ามรายการซ้ำจากข้อมูลที่มีอยู่แล้ว
              </label>
              <button type="submit" disabled={importingCsv} className="admin-primary-button admin-primary-button-full">
                <UploadCloud size={16} />
                {importingCsv ? "กำลังนำเข้า..." : "นำเข้าข้อมูล"}
              </button>
            </form>
          </article>
        </section>

        <section className="admin-block">
          <div className="table-toolbar">
            <h2 className="admin-block-title">
              <Database size={18} /> รายการข้อมูล
            </h2>
            <div className="table-actions">
              <label className="table-page-size">
                ต่อหน้า
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  disabled={isLoading}
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <div className="table-search-wrap">
                <Search size={16} className="table-search-icon" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ค้นหาคำถามหรือคำตอบ..."
                  className="table-search-input"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setQuery(search.trim())
                      loadDocuments(1, search.trim())
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setQuery(search.trim())
                  loadDocuments(1, search.trim())
                }}
                disabled={isLoading}
              >
                ค้นหา
              </button>
              <button type="button" className="ghost-button" onClick={() => loadDocuments()} disabled={isLoading} title="รีเฟรชข้อมูล">
                <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
              </button>
              <div className="density-toggle" role="group" aria-label="รูปแบบตาราง">
                <button
                  type="button"
                  className={`ghost-button ${tableDensity === "comfortable" ? "active" : ""}`}
                  onClick={() => setTableDensity("comfortable")}
                >
                  สบายตา
                </button>
                <button
                  type="button"
                  className={`ghost-button ${tableDensity === "compact" ? "active" : ""}`}
                  onClick={() => setTableDensity("compact")}
                >
                  กระชับ
                </button>
              </div>
            </div>
          </div>

          {toast ? <div className="admin-table-toast"><AppToast kind={toast.kind} text={toast.text} /></div> : null}

          <div className="table-wrap">
            <table className={`admin-table ${tableDensity === "compact" ? "is-compact" : ""}`}>
              <thead>
                <tr>
                  <th className="col-id">รหัส</th>
                  <th className="col-question">คำถาม / หัวข้อ</th>
                  <th className="col-answer">คำตอบ / ข้อมูล</th>
                  <th>การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <>
                    <tr className="admin-skeleton-row"><td colSpan={4}><span /></td></tr>
                    <tr className="admin-skeleton-row"><td colSpan={4}><span /></td></tr>
                    <tr className="admin-skeleton-row"><td colSpan={4}><span /></td></tr>
                  </>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-empty-cell">
                      <p className="muted admin-empty-text">
                        {query ? `ไม่พบข้อมูลที่ตรงกับคำค้นหา "${query}"` : "ไม่พบรายการข้อมูลในระบบ"}
                      </p>
                      {query ? (
                        <button
                          type="button"
                          className="ghost-button admin-clear-search"
                          onClick={() => {
                            setSearch("")
                            setQuery("")
                            void loadDocuments(1, "")
                          }}
                        >
                          ล้างคำค้นหา
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ) : items.map((item) => (
                  <tr key={item.id}>
                    <td>#{item.id}</td>
                    <td>{item.question}</td>
                    <td>{item.answer}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="ghost-button" onClick={() => startEdit(item)} title="แก้ไข">
                          <Edit2 size={14} />
                        </button>
                        <button type="button" className="ghost-button" onClick={() => reembedOne(item.id)} title="ประมวลผลใหม่">
                          <RefreshCw size={14} />
                        </button>
                        <button
                          type="button"
                          className="ghost-button admin-delete-action"
                          onClick={() => setConfirmAction({ type: "delete", id: item.id })}
                          title="ลบ"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-pagination">
            <button
              type="button"
              className="ghost-button"
              disabled={page <= 1 || isLoading}
              onClick={() => loadDocuments(page - 1, query)}
            >
              หน้าก่อนหน้า
            </button>
            <span className="muted admin-pagination-meta">
              หน้า {page} จาก {totalPages} (รวมทั้งหมด {total} รายการ)
            </span>
            <button
              type="button"
              className="ghost-button"
              disabled={page >= totalPages || isLoading}
              onClick={() => loadDocuments(page + 1, query)}
            >
              หน้าถัดไป
            </button>
          </div>
        </section>
      </section>
      {confirmAction ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setConfirmAction(null)}>
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <h3>
              <AlertTriangle size={18} />
              ยืนยันการดำเนินการ
            </h3>
            <p>
              {confirmAction.type === "delete"
                ? `ยืนยันการลบเอกสารหมายเลข #${confirmAction.id}?`
                : "ยืนยันการอัปเดตประมวลผลข้อมูลทั้งหมด? การดำเนินการนี้อาจใช้เวลาสักครู่"}
            </p>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setConfirmAction(null)}
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
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
