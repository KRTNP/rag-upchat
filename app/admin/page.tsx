"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"

type DocumentItem = {
  id: number
  question: string
  answer: string
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

export default function AdminPage() {
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [isAuthed, setIsAuthed] = useState(false)

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [adminKey, setAdminKey] = useState("")

  const [items, setItems] = useState<DocumentItem[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)

  const [csvText, setCsvText] = useState("")
  const [importEmbedNow, setImportEmbedNow] = useState(true)

  const totalPages = useMemo(() => Math.max(Math.ceil(total / pageSize), 1), [total, pageSize])

  function getHeaders() {
    return {
      "Content-Type": "application/json",
      ...(adminKey.trim() ? { "x-admin-key": adminKey.trim() } : {})
    }
  }

  async function checkAuth() {
    setCheckingAuth(true)
    try {
      const res = await fetch("/api/admin/me")
      if (!res.ok) {
        setIsAuthed(false)
      } else {
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
      const res = await fetch("/api/admin/metrics", {
        headers: getHeaders()
      })
      const data = (await res.json()) as Metrics & { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load metrics")
      }
      setMetrics(data)
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "Unknown error"
      setError(apiMessage)
    }
  }

  async function loadDocuments(nextPage = page, nextQuery = query) {
    if (!isAuthed) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(pageSize),
        search: nextQuery
      })

      const res = await fetch(`/api/admin/documents?${params.toString()}`, {
        headers: getHeaders()
      })
      const data = (await res.json()) as DocumentResponse

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load documents")
      }

      setItems(data.items)
      setTotal(data.total)
      setPage(data.page)
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "Unknown error"
      setError(apiMessage)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthed) return
    loadDocuments(1, query)
    loadMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError(null)

    if (adminKey.trim()) {
      setIsAuthed(true)
      setMessage("Authenticated via ADMIN_API_KEY header")
      return
    }

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      })

      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "Login failed")
      }

      setMessage("Admin session ready")
      setIsAuthed(true)
      setUsername("")
      setPassword("")
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "Unknown error"
      setError(apiMessage)
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

    setError(null)
    setMessage(null)

    const method = editingId ? "PATCH" : "POST"
    const url = editingId ? `/api/admin/documents/${editingId}` : "/api/admin/documents"

    try {
      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify({ question, answer, embedNow: true })
      })
      const data = (await res.json()) as { error?: string }

      if (!res.ok) {
        throw new Error(data.error ?? "Save failed")
      }

      setMessage(editingId ? "Document updated" : "Document created")
      resetEditor()
      await Promise.all([loadDocuments(), loadMetrics()])
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "Unknown error"
      setError(apiMessage)
    }
  }

  async function deleteDocument(id: number) {
    if (!window.confirm(`Delete document #${id}?`)) return

    try {
      const res = await fetch(`/api/admin/documents/${id}`, {
        method: "DELETE",
        headers: getHeaders()
      })

      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "Delete failed")
      }

      setMessage("Document deleted")
      if (items.length === 1 && page > 1) {
        await loadDocuments(page - 1)
      } else {
        await loadDocuments()
      }
      await loadMetrics()
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "Unknown error"
      setError(apiMessage)
    }
  }

  async function reembedOne(id: number) {
    try {
      const res = await fetch(`/api/admin/reembed/${id}`, {
        method: "POST",
        headers: getHeaders()
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "Re-embed failed")
      }
      setMessage(`Re-embedded #${id}`)
      await loadMetrics()
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "Unknown error"
      setError(apiMessage)
    }
  }

  async function reembedAll() {
    try {
      const res = await fetch("/api/admin/reembed-all", {
        method: "POST",
        headers: getHeaders()
      })
      const data = (await res.json()) as { total?: number; success?: number; failed?: Array<{ id: number }>; error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "Re-embed all failed")
      }
      setMessage(`Re-embed done: ${data.success}/${data.total}, failed ${data.failed?.length ?? 0}`)
      await loadMetrics()
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "Unknown error"
      setError(apiMessage)
    }
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!csvText.trim()) return

    setError(null)
    setMessage(null)

    try {
      const res = await fetch("/api/admin/import-csv", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ csvText, embedNow: importEmbedNow })
      })

      const data = (await res.json()) as { imported?: number; embedded?: number; failed?: Array<{ id: number }>; error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "Import failed")
      }

      setMessage(`Imported ${data.imported} rows, embedded ${data.embedded}, failed ${data.failed?.length ?? 0}`)
      setCsvText("")
      await Promise.all([loadDocuments(1, query), loadMetrics()])
    } catch (apiError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "Unknown error"
      setError(apiMessage)
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" })
    setIsAuthed(false)
    setMessage(null)
    setError(null)
  }

  if (checkingAuth) {
    return (
      <main className="admin-page">
        <section className="admin-card">
          <p>Checking admin session...</p>
        </section>
      </main>
    )
  }

  if (!isAuthed) {
    return (
      <main className="admin-page">
        <section className="admin-card">
          <h1>Admin Access</h1>
          <p>Sign in with admin credentials. Optional: use raw ADMIN_API_KEY in fallback mode.</p>
          <form onSubmit={handleLogin} className="admin-form">
            <label>
              Username
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="ADMIN_USERNAME" />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="ADMIN_PASSWORD"
              />
            </label>
            <label>
              Fallback key (optional)
              <input
                type="password"
                value={adminKey}
                onChange={(event) => setAdminKey(event.target.value)}
                placeholder="ADMIN_API_KEY"
              />
            </label>
            <button type="submit">Continue</button>
          </form>
          {error ? <p className="chat-error">{error}</p> : null}
        </section>
      </main>
    )
  }

  return (
    <main className="admin-page">
      <section className="admin-layout">
        <header className="admin-header">
          <div>
            <p className="chat-kicker">ADMIN</p>
            <h1>RAG Data Manager</h1>
            <p>Manage `documents` in Supabase and refresh embeddings.</p>
          </div>
          <div className="admin-header-actions">
            <button type="button" className="ghost-button" onClick={reembedAll}>
              Re-embed all
            </button>
            <button type="button" className="ghost-button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <section className="admin-metrics" data-testid="admin-metrics">
          <article className="metric-card">
            <h3>Total Docs</h3>
            <p>{metrics?.totalDocuments ?? "-"}</p>
          </article>
          <article className="metric-card">
            <h3>Embedded</h3>
            <p>{metrics?.embeddedDocuments ?? "-"}</p>
          </article>
          <article className="metric-card">
            <h3>Pending</h3>
            <p>{metrics?.pendingEmbeddings ?? "-"}</p>
          </article>
          <article className="metric-card">
            <h3>Latest ID</h3>
            <p>{metrics?.latestDocumentId ?? "-"}</p>
          </article>
        </section>

        <section className="admin-grid">
          <article className="admin-block">
            <h2>{editingId ? `Edit #${editingId}` : "Create Document"}</h2>
            <form onSubmit={submitDocument} className="admin-form">
              <label>
                Question
                <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} required />
              </label>
              <label>
                Answer
                <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={4} required />
              </label>
              <div className="row-actions">
                <button type="submit">{editingId ? "Update + re-embed" : "Create + embed"}</button>
                {editingId ? (
                  <button type="button" className="ghost-button" onClick={resetEditor}>
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </form>
          </article>

          <article className="admin-block">
            <h2>Import CSV</h2>
            <p className="muted">Expected columns: `question,answer` (header optional)</p>
            <form onSubmit={importCsv} className="admin-form">
              <textarea
                value={csvText}
                onChange={(event) => setCsvText(event.target.value)}
                rows={7}
                placeholder={'question,answer\n"Q1","A1"'}
              />
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={importEmbedNow}
                  onChange={(event) => setImportEmbedNow(event.target.checked)}
                />
                Embed immediately
              </label>
              <button type="submit">Import</button>
            </form>
          </article>
        </section>

        <section className="admin-block">
          <div className="table-toolbar">
            <h2>Documents</h2>
            <div className="table-actions">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search question/answer"
              />
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setQuery(search.trim())
                  loadDocuments(1, search.trim())
                }}
              >
                Search
              </button>
              <button type="button" className="ghost-button" onClick={() => loadDocuments()} disabled={isLoading}>
                Refresh
              </button>
            </div>
          </div>

          {message ? <p className="admin-success">{message}</p> : null}
          {error ? <p className="chat-error">{error}</p> : null}

          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Question</th>
                  <th>Answer</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.question}</td>
                    <td>{item.answer}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="ghost-button" onClick={() => startEdit(item)}>
                          Edit
                        </button>
                        <button type="button" className="ghost-button" onClick={() => reembedOne(item.id)}>
                          Re-embed
                        </button>
                        <button type="button" className="ghost-button" onClick={() => deleteDocument(item.id)}>
                          Delete
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
              Previous
            </button>
            <span>
              Page {page} / {totalPages} ({total} rows)
            </span>
            <button
              type="button"
              className="ghost-button"
              disabled={page >= totalPages || isLoading}
              onClick={() => loadDocuments(page + 1, query)}
            >
              Next
            </button>
          </div>
        </section>
      </section>
    </main>
  )
}
