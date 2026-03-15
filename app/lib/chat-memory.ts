"use client"

import type { User } from "@supabase/supabase-js"
import type { ChatMessage } from "@/app/lib/chat-types"
import { getSupabaseBrowserClient } from "@/app/lib/supabase-browser"

export const GUEST_MESSAGES_STORAGE_KEY = "rag-upchat:messages"
const PINNED_CONVERSATIONS_STORAGE_KEY = "rag-upchat:pinned-conversations"
export type ConversationSummary = {
  id: string
  title: string
  updatedAt: string
}

type ConversationRow = {
  id: string
  title?: string | null
  updated_at?: string
}

type MessageRow = {
  id: string
  role: "user" | "bot"
  content: string
  created_at: string
}

export function loadGuestMessages(): ChatMessage[] {
  try {
    const raw = window.localStorage.getItem(GUEST_MESSAGES_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as ChatMessage[]
    if (!Array.isArray(parsed)) return []

    return parsed.filter((item) => item && typeof item.id === "string" && typeof item.text === "string")
  } catch {
    return []
  }
}

export function saveGuestMessages(messages: ChatMessage[]) {
  window.localStorage.setItem(GUEST_MESSAGES_STORAGE_KEY, JSON.stringify(messages))
}

type PinnedConversationMap = Record<string, string[]>

export function loadPinnedConversationIds(userId: string) {
  try {
    const raw = window.localStorage.getItem(PINNED_CONVERSATIONS_STORAGE_KEY)
    if (!raw) return [] as string[]
    const parsed = JSON.parse(raw) as PinnedConversationMap
    const ids = parsed?.[userId]
    if (!Array.isArray(ids)) return [] as string[]
    return ids.filter((id) => typeof id === "string")
  } catch {
    return [] as string[]
  }
}

export function savePinnedConversationIds(userId: string, conversationIds: string[]) {
  try {
    const raw = window.localStorage.getItem(PINNED_CONVERSATIONS_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as PinnedConversationMap) : {}
    parsed[userId] = Array.from(new Set(conversationIds))
    window.localStorage.setItem(PINNED_CONVERSATIONS_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // Ignore storage write errors
  }
}

export async function loginWithPassword(email: string, password: string) {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUpWithPassword(email: string, password: string) {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  return supabase.auth.signUp({ email, password })
}

export async function requestPasswordReset(email: string, redirectTo?: string) {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  return supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
}

export async function signOut() {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    return
  }

  await supabase.auth.signOut()
}

export async function getCurrentUser() {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    return null
  }

  const { data } = await supabase.auth.getUser()
  return data.user
}

export async function getAccessToken() {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    return null
  }

  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function ensureConversation(user: User) {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    throw new Error("Supabase browser client unavailable")
  }

  const latest = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<ConversationRow>()

  if (!latest.error && latest.data?.id) {
    return latest.data.id
  }

  const created = await supabase
    .from("chat_conversations")
    .insert({ user_id: user.id, title: "My conversation" })
    .select("id")
    .single<ConversationRow>()

  if (created.error || !created.data?.id) {
    throw new Error(created.error?.message ?? "Cannot create conversation")
  }

  return created.data.id
}

export async function listConversations(userId: string) {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    throw new Error("Supabase browser client unavailable")
  }

  const { data, error } = await supabase
    .from("chat_conversations")
    .select("id,title,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50)

  if (error) {
    throw new Error(error.message)
  }

  return ((data as ConversationRow[] | null) ?? []).map((row) => ({
    id: row.id,
    title: row.title?.trim() || "Untitled chat",
    updatedAt: row.updated_at ?? new Date().toISOString()
  })) as ConversationSummary[]
}

export async function createConversation(userId: string, title = "New chat") {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    throw new Error("Supabase browser client unavailable")
  }

  const { data, error } = await supabase
    .from("chat_conversations")
    .insert({ user_id: userId, title })
    .select("id,title,updated_at")
    .single<ConversationRow>()

  if (error || !data) {
    throw new Error(error?.message ?? "Cannot create conversation")
  }

  return {
    id: data.id,
    title: data.title?.trim() || "Untitled chat",
    updatedAt: data.updated_at ?? new Date().toISOString()
  } as ConversationSummary
}

export async function renameConversation(conversationId: string, title: string) {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    throw new Error("Supabase browser client unavailable")
  }

  const nextTitle = title.trim() || "New chat"
  const { error } = await supabase
    .from("chat_conversations")
    .update({ title: nextTitle, updated_at: new Date().toISOString() })
    .eq("id", conversationId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteConversation(conversationId: string) {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    throw new Error("Supabase browser client unavailable")
  }

  const { error } = await supabase.from("chat_conversations").delete().eq("id", conversationId)
  if (error) {
    throw new Error(error.message)
  }
}

export async function loadConversationMessages(conversationId: string) {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    throw new Error("Supabase browser client unavailable")
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id,role,content,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return ((data as MessageRow[] | null) ?? []).map((row) => ({
    id: row.id,
    role: row.role,
    text: row.content,
    createdAt: row.created_at
  }))
}

export async function appendConversationMessage(conversationId: string, userId: string, message: ChatMessage) {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    throw new Error("Supabase browser client unavailable")
  }

  const insert = await supabase.from("chat_messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: message.role,
    content: message.text,
    created_at: message.createdAt
  })

  if (insert.error) {
    throw new Error(insert.error.message)
  }

  await supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId)
}

export async function clearConversation(conversationId: string) {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    throw new Error("Supabase browser client unavailable")
  }

  const { error } = await supabase.from("chat_messages").delete().eq("conversation_id", conversationId)
  if (error) {
    throw new Error(error.message)
  }
}
