# rag-upchat

แอปแชต RAG (Next.js) ที่ใช้:
- Cloudflare AI (`@cf/baai/bge-m3`) สำหรับ embedding
- Supabase (Postgres + pgvector) สำหรับ vector search
- Gemini (`gemini-2.5-flash`) สำหรับตอบคำถาม
- Fallback model: z.ai (`glm-4.7-flash`) เมื่อ Gemini ติด quota/rate-limit

## โครงสร้างหลัก

- `app/page.tsx` หน้าแชต
- `app/api/chat/route.ts` endpoint ตอบคำถามด้วย RAG + Gemini
- `app/api/embed/route.ts` endpoint สำหรับสร้าง embedding
- `app/lib/embedding.ts` helper เรียก Cloudflare embedding
- `app/lib/supabase.ts` helper สร้าง Supabase client จาก env
- `scripts/embed.mjs` สคริปต์ฝัง embedding ให้ข้อมูลในตาราง `documents`

## 1) ติดตั้ง

```bash
npm install
```

## 2) ตั้งค่า Environment

สร้างไฟล์ `.env.local`:

```env
GEMINI_API_KEY=...
ZAI_API_KEY=...
SERVER_RATE_LIMIT_MAX=20
SERVER_RATE_LIMIT_WINDOW_MS=60000
PROHIBITED_KEYWORDS=keyword1,keyword2
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_CLIENT_DAILY_QUOTA=40
SUPABASE_SERVICE_ROLE_KEY=...
CF_ACCOUNT_ID=...
CF_API_TOKEN=...
ADMIN_ALLOWED_EMAILS=...
```

## 3) เตรียมฐานข้อมูล Supabase

ถ้าระบบเดิมยังใช้คอลัมน์ `question/answer` ให้รัน migration นี้ก่อน:

```sql
-- copy เนื้อหาจากไฟล์:
-- supabase/migrations/20260315_unify_documents_content_and_rag.sql
```

รัน SQL นี้ใน Supabase SQL Editor:

```sql
create extension if not exists vector;

create table if not exists documents (
  id bigserial primary key,
  content text not null,
  embedding vector(1024)
);

create or replace function match_documents(
  query_embedding vector(1024),
  match_threshold float default 0.7,
  match_count int default 3
)
returns table (
  id bigint,
  content text,
  similarity float
)
language sql
as $$
  select
    documents.id,
    documents.content,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.embedding is not null
    and 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
$$;
```

เพิ่มตาราง memory แชท (สำหรับจำข้ามอุปกรณ์เมื่อ login):

```sql
create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','bot')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;

create policy "users own conversations"
on chat_conversations for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own messages"
on chat_messages for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

## 4) ใส่ข้อมูลคำถาม/คำตอบ

นำเข้า `data.csv` ลงตาราง `documents` (แนะนำให้เป็นคอลัมน์ `content`)
ตัวอย่าง format:
- `คำถาม: ... คำตอบ: ...`

## 5) สร้าง embedding ให้เอกสาร

```bash
npm run embed:all
```

## 6) รันโปรเจกต์

```bash
npm run dev
```

เปิด `http://localhost:3000`

## 7) จัดการข้อมูล RAG ผ่านหน้า Admin

- เปิด `http://localhost:3000/admin`
- เข้าระบบด้วย Supabase Auth (email/password)
- สามารถจำกัดอีเมลผู้ดูแลผ่าน `ADMIN_ALLOWED_EMAILS` (คั่นด้วย comma)
- หน้า Admin รองรับ:
  - ค้นหา/เพิ่ม/แก้ไข/ลบ เอกสารในตาราง `documents`
  - Re-embed รายเอกสาร หรือ Re-embed ทั้งระบบ
  - นำเข้า CSV (`question,answer`) และสั่ง embed ทันทีได้
  - Dashboard metrics (total/embedded/pending/latest id)

> แนะนำให้ตั้ง `SUPABASE_SERVICE_ROLE_KEY` สำหรับสิทธิ์เขียนข้อมูลในระบบ Admin/API ฝั่งเซิร์ฟเวอร์

## 8) รันทดสอบ

```bash
npm run test:run
npm run lint
npm run build
npm run test:e2e
```

## 9) Guardrails (No-Login Mode)

- Client-side quota: จำกัดจำนวนข้อความรายวันของ guest ผ่าน `NEXT_PUBLIC_CLIENT_DAILY_QUOTA`
- Server-side rate limit: จำกัดตาม IP ผ่าน `SERVER_RATE_LIMIT_MAX` และ `SERVER_RATE_LIMIT_WINDOW_MS`
- Prohibited keywords: block ก่อนถึง LLM ผ่าน `PROHIBITED_KEYWORDS`
- Out-of-scope rule: ถ้าคำถามนอกขอบเขตและไม่ match ฐานความรู้เพียงพอ ระบบจะปฏิเสธแบบสุภาพ

## หมายเหตุ

- โค้ดถูกปรับให้ `build` ผ่านแล้วและไม่ hardcode `http://localhost:3000` ใน API ภายใน
- ถ้า env ไม่ครบ API จะตอบ error ชัดเจนแทนพังตอน build
